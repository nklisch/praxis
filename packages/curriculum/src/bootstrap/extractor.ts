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
  const userMessage = buildUserMessage(input);

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

function buildUserMessage(input: RunConceptExtractorInput): string {
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

function extractJsonBlock(text: string): unknown {
  // Look for fenced JSON; fall back to the largest {...} block.
  const fence = text.match(/```json\n([\s\S]*?)\n```/);
  if (fence?.[1]) {
    return JSON.parse(fence[1]);
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Extractor output contained no JSON block");
  }
  return JSON.parse(text.slice(start, end + 1));
}
