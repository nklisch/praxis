import type { Engine, Logger, ProposedCourse } from "@praxis/core/types";
import { runOneShot } from "@praxis/engines";
import { z } from "zod";
import { EXTRACTOR_SYSTEM_PROMPT } from "./extractor-prompt.js";

export interface RunConceptExtractorInput {
  engine: Engine;
  chunks: ReadonlyArray<{
    documentId: string;
    chunkIndex: number;
    text: string;
    locator: { page?: number; section?: string };
  }>;
  courseTitle: string;
  subject: string;
  gradeLevel: string;
  log: Logger;
  /** Maximum chunks per batch sent to the extractor. Currently single-pass. */
  chunksPerBatch?: number;
  /** Cap on extracted concept count. Default 200. */
  maxConcepts?: number;
  /**
   * Maximum number of input chunks to actually send to the model in the
   * single-pass extraction. When the document has more, an even-stride sample
   * is taken across the document. Default chosen to keep input ≪ 200k token
   * context window: 120 chunks × ~2000 chars × ~0.27 tokens/char ≈ 65k tokens,
   * leaving comfortable headroom for the system prompt and JSON output.
   */
  maxChunks?: number;
}

/**
 * Default cap on chunks sent to the extractor in a single pass. Keep this
 * conservative — overshooting context-window is the dominant cause of
 * "no JSON block" / truncated-output failures on large textbooks.
 */
export const DEFAULT_EXTRACTOR_MAX_CHUNKS = 120;

/**
 * Take an even-stride sample of `n` items from `arr`. Always includes the
 * first and last item so the document's full range is anchored. Returns a
 * copy of the input when it already fits.
 */
export function sampleEvenly<T>(arr: ReadonlyArray<T>, n: number): T[] {
  if (arr.length <= n) return [...arr];
  if (n <= 0) return [];
  if (n === 1) return [arr[0] as T];
  const stride = (arr.length - 1) / (n - 1);
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round(i * stride);
    out.push(arr[idx] as T);
  }
  return out;
}

// Zod schema matching ProposedCourse (Zod validates extractor output before trusting it).
const ProposedSchema = z.object({
  title: z.string().min(1),
  subject: z.string(),
  gradeLevel: z.string(),
  thresholds: z.object({
    conceptMastery: z.number().min(0).max(1).default(0.7),
    examPass: z.number().min(0).max(1).default(0.7),
    allowRetake: z.boolean().default(true),
    decayDays: z.number().int().positive().default(14),
  }),
  proposedConcepts: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string(),
        evidence: z.array(z.object({ kind: z.literal("event"), id: z.string() })).default([]),
      }),
    )
    .min(1),
  proposedEdges: z
    .array(
      z.object({
        fromName: z.string(),
        toName: z.string(),
        strength: z.number().min(0).max(1),
        rationale: z.string(),
      }),
    )
    .default([]),
  proposedLessons: z
    .array(
      z.object({
        draftLessonId: z.string(),
        title: z.string(),
        conceptNames: z.array(z.string()).min(1),
        references: z
          .array(
            z.object({
              kind: z.enum(["textbook", "url", "video", "note"]),
              source: z.string(),
              locator: z
                .object({
                  page: z.number().int().optional(),
                  section: z.string().optional(),
                })
                .optional(),
            }),
          )
          .default([]),
        suggestedStrategy: z.string().default("worked-examples"),
        estimatedMinutes: z.number().int().positive().default(45),
      }),
    )
    .min(1),
});

/**
 * Run the concept-extractor agent in a fresh one-shot engine session.
 *
 * Isolation: uses runOneShot so the extractor doesn't pollute the live
 * tutoring session's prompt cache or conversation history. Same pattern
 * as Phase 5 vision runs.
 *
 * The extractor gets 0 tools — it's text-only. If the adapter refuses
 * a zero-tool registry, we register a single no-op tool (see note below).
 */
export async function runConceptExtractor(
  input: RunConceptExtractorInput,
): Promise<ProposedCourse> {
  // Cap input size before building the user message — see DEFAULT_EXTRACTOR_MAX_CHUNKS.
  const maxChunks = input.maxChunks ?? DEFAULT_EXTRACTOR_MAX_CHUNKS;
  const totalChunks = input.chunks.length;
  const sampledChunks = sampleEvenly(input.chunks, maxChunks);
  const sampled = sampledChunks.length < totalChunks;
  if (sampled) {
    input.log.info("extractor.input_sampled", {
      total: totalChunks,
      kept: sampledChunks.length,
      strategy: "even_stride",
    });
  }
  const userMessage = buildUserMessage({
    ...input,
    chunks: sampledChunks,
    ...(sampled && { sampledFrom: totalChunks }),
  });

  // Open a fresh one-shot session — isolated from any live tutoring.
  // No-op tool dispatch: the extractor never calls tools; the registry is
  // a minimal stub that returns a benign error if the model tries anyway.
  const events = runOneShot(
    input.engine,
    {
      systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
      tools: {
        list: () => [],
        dispatch: async () => ({
          ok: false as const,
          error: {
            code: "no_tools",
            message: "extractor has no tools",
            recoverable: false as const,
          },
        }),
      },
      maxSteps: 1,
    },
    userMessage,
  );

  // Drain to a single full assistant message. The extractor is text-only.
  let assistantText = "";
  for await (const event of events) {
    if (event.type === "model_message") {
      assistantText += event.content;
    }
    if (event.type === "error") {
      throw new Error(`Extractor engine error: ${event.error.message}`);
    }
  }

  if (!assistantText.trim()) {
    throw new Error("Extractor produced empty response from engine");
  }

  const json = extractJsonBlock(assistantText);
  const parsed = ProposedSchema.safeParse(json);
  if (!parsed.success) {
    input.log.warn("extractor_invalid_output", { errors: parsed.error.flatten() });
    throw new Error(
      `Extractor output failed schema validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // Cap concepts; trim from the end of the array (extractor lists by importance).
  const maxConcepts = input.maxConcepts ?? 200;
  const raw = parsed.data;
  if (raw.proposedConcepts.length > maxConcepts) {
    const kept = new Set(
      raw.proposedConcepts.slice(0, maxConcepts).map((c: { name: string }) => c.name),
    );
    return {
      ...raw,
      proposedConcepts: raw.proposedConcepts.slice(0, maxConcepts),
      proposedEdges: raw.proposedEdges.filter(
        (e: { fromName: string; toName: string }) => kept.has(e.fromName) && kept.has(e.toName),
      ),
      proposedLessons: raw.proposedLessons
        .map((l: { conceptNames: string[] }) => ({
          ...l,
          conceptNames: l.conceptNames.filter((n: string) => kept.has(n)),
        }))
        .filter((l: { conceptNames: string[] }) => l.conceptNames.length > 0),
    } as ProposedCourse;
  }

  return raw as ProposedCourse;
}

interface BuildUserMessageInput
  extends Pick<RunConceptExtractorInput, "chunks" | "courseTitle" | "subject" | "gradeLevel"> {
  /** Set when the chunks passed are an even-stride sample of a larger total. */
  sampledFrom?: number;
}

function buildUserMessage(input: BuildUserMessageInput): string {
  // Group chunks by document, prefix with document marker.
  const byDoc = new Map<string, typeof input.chunks>();
  for (const c of input.chunks) {
    const arr = byDoc.get(c.documentId) ?? [];
    // biome-ignore lint/suspicious/noExplicitAny: typed above, array push is safe
    (arr as any[]).push(c);
    byDoc.set(c.documentId, arr as typeof input.chunks);
  }
  const sections: string[] = [];
  sections.push(`Course title: ${input.courseTitle}`);
  sections.push(`Subject: ${input.subject}`);
  sections.push(`Grade level: ${input.gradeLevel}`);
  if (input.sampledFrom !== undefined) {
    sections.push("");
    sections.push(
      `NOTE: The excerpts below are a representative sample of ${input.chunks.length} chunks evenly spaced across a ${input.sampledFrom}-chunk source document, included to fit the model context. Treat them as a structural overview — extract a concept graph that covers the document's apparent scope, not just the sampled excerpts. Use chunk indices and locators to infer the document's structure.`,
    );
  }
  sections.push("");
  for (const [docId, chunks] of byDoc) {
    sections.push(`=== Document ${docId} ===`);
    for (const c of chunks) {
      const loc = c.locator.section ? ` [${c.locator.section}]` : "";
      const page = c.locator.page ? ` (p.${c.locator.page})` : "";
      sections.push(`--- chunk ${c.chunkIndex}${loc}${page} ---`);
      sections.push(c.text);
      sections.push("");
    }
  }
  return sections.join("\n");
}

/**
 * Pull the JSON object out of an extractor response. The model is asked to
 * emit ` ```json … ``` `, but real responses sometimes drop the language tag
 * or wrap the fence with adjacent prose. We try, in order:
 *   1. ` ```json ` fence (the documented contract)
 *   2. plain ` ``` ` fence (lang tag dropped)
 *   3. raw `{ … }` from first `{` to last `}`
 * The first parse that yields a valid JSON value wins.
 */
function extractJsonBlock(text: string): unknown {
  const candidates: string[] = [];
  // 1. Fenced with explicit `json` tag.
  for (const m of text.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)) {
    if (m[1]) candidates.push(m[1]);
  }
  // 2. Fenced without language tag.
  if (candidates.length === 0) {
    for (const m of text.matchAll(/```\s*\n([\s\S]*?)\n\s*```/g)) {
      if (m[1]) candidates.push(m[1]);
    }
  }
  // 3. Raw brace span. Only used when no fences matched — picking braces from
  // text that contains a fence would risk grabbing example-JSON inside prose.
  if (candidates.length === 0) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      candidates.push(text.slice(start, end + 1));
    }
  }

  if (candidates.length === 0) {
    throw new Error("Extractor output contained no JSON block");
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Extractor output JSON failed to parse: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
