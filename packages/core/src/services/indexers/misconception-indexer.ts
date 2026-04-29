/**
 * MisconceptionIndexer — agent-driven session-end misconception detection.
 *
 * Reads the full session transcript via a one-shot engine call and extracts
 * structured misconceptions. Deduplicates by (studentId, conceptId, errorForm).
 * Merges evidence on re-run. Failures abort gracefully — no row writes.
 */

import { runOneShot } from "@praxis/engines";
import { misconceptions } from "@praxis/memory/schema";
import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { PraxisDb } from "../../db/index.js";
import type {
  CourseStateReader,
  Engine,
  Indexer,
  IndexerContext,
  Logger,
  StudentId,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { MISCONCEPTION_SYSTEM_PROMPT } from "./misconception-prompt.js";

/** Maximum evidence event IDs stored per misconception row (FIFO truncation). */
const MAX_EVIDENCE = 50;

/**
 * Approximate token budget for the transcript portion of the user message.
 * Rough estimate: 4 chars ≈ 1 token. We cap at ~25k tokens of recent events.
 */
const MAX_TRANSCRIPT_CHARS = 100_000;

/**
 * Valid remediation strategy IDs (SSOT for the misconception indexer).
 * Adding a new strategy = one change here.
 */
const REMEDIATION_STRATEGY_IDS = [
  "worked-examples",
  "socratic",
  "elaborative-interrogation",
  "analogy-bridging",
  "productive-failure-gauntlet",
] as const;

const MisconceptionEntrySchema = z.object({
  conceptId: z.string().min(1),
  description: z.string().min(1),
  errorForm: z.string().min(1),
  remediation: z.object({
    strategyId: z.string().min(1),
    rationale: z.string().min(1),
  }),
  evidenceEventIds: z.array(z.string()),
});

const MisconceptionListSchema = z.array(MisconceptionEntrySchema);

type ParsedMisconception = z.infer<typeof MisconceptionEntrySchema>;

export interface MisconceptionIndexerDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves the active engine for the one-shot session. */
  engineResolver: () => Engine;
  /**
   * Resolves the courseId for the given sessionId.
   * Returns null if the session has no associated course.
   */
  sessionCourseId: (sessionId: string) => string | null;
  courseStateReader: CourseStateReader;
}

export class MisconceptionIndexer implements Indexer {
  readonly id = "misconception";
  readonly schedule = "session-end" as const;

  constructor(private readonly deps: MisconceptionIndexerDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    // Skip empty / tiny sessions.
    if (ctx.events.length < 2) return;

    const rawCourseId = this.deps.sessionCourseId(ctx.sessionId);
    if (!rawCourseId) return; // misconceptions need a concept graph

    const courseId = brandId<"CourseId">(rawCourseId);
    const snapshot = await this.deps.courseStateReader.read({
      studentId: ctx.studentId,
      courseId,
    });
    if (!snapshot) return;

    const conceptCatalog = [...snapshot.conceptsById.values()].map((c) => ({
      id: c.conceptId as string,
      name: c.name,
    }));
    if (conceptCatalog.length === 0) return;

    const validConceptIds = new Set(conceptCatalog.map((c) => c.id));

    const userMessage = buildTranscriptPrompt(ctx, conceptCatalog);

    // One-shot engine call with a no-op tool registry.
    const events = runOneShot(
      this.deps.engineResolver(),
      {
        systemPrompt: MISCONCEPTION_SYSTEM_PROMPT,
        tools: {
          list: () => [],
          dispatch: noopDispatch,
        },
        maxSteps: 1,
      },
      userMessage,
    );

    let assistantText = "";
    for await (const ev of events) {
      if (ev.type === "model_message") {
        assistantText += ev.content;
      }
      if (ev.type === "error") {
        this.deps.log.warn("misconception.engine_error", { error: ev.error.message });
        return; // abort gracefully — no DB writes
      }
    }

    if (!assistantText.trim()) return;

    const parsed = parseMisconceptionOutput(assistantText, this.deps.log);
    if (parsed === null) return;
    if (parsed.length === 0) return;

    for (const entry of parsed) {
      // Validate conceptId against catalog.
      if (!validConceptIds.has(entry.conceptId)) {
        this.deps.log.warn("misconception.unknown_concept_id", { conceptId: entry.conceptId });
        continue;
      }
      // Require at least one evidence event.
      if (entry.evidenceEventIds.length === 0) {
        this.deps.log.warn("misconception.no_evidence", { errorForm: entry.errorForm });
        continue;
      }
      // Normalize unknown strategy to "worked-examples" with a warn.
      let strategyId = entry.remediation.strategyId;
      if (
        !REMEDIATION_STRATEGY_IDS.includes(strategyId as (typeof REMEDIATION_STRATEGY_IDS)[number])
      ) {
        this.deps.log.warn("misconception.unknown_strategy_id", { strategyId });
        strategyId = "worked-examples";
      }

      this.upsertMisconception(ctx.studentId, {
        ...entry,
        remediation: { ...entry.remediation, strategyId },
      });
    }
  }

  /**
   * Upsert a misconception: dedup by (studentId, conceptId, errorForm).
   * Merge evidence (union, FIFO capped at 50); update lastObservedAt; preserve firstObservedAt + status.
   *
   * Exported for reuse by the active-path `record_misconception` tool.
   */
  upsertMisconception(
    studentId: StudentId,
    m: ParsedMisconception,
  ): { misconceptionId: string; merged: boolean } {
    return upsertMisconception(this.deps.db, studentId, m);
  }
}

/**
 * Exported standalone helper: same logic as the instance method.
 * The active-path `record_misconception` tool imports this directly.
 * Returns the misconception ID and whether it was a merge (dedup) vs new insert.
 */
export function upsertMisconception(
  db: PraxisDb,
  studentId: StudentId,
  m: ParsedMisconception,
): { misconceptionId: string; merged: boolean } {
  const _conceptId = brandId<"ConceptId">(m.conceptId);

  const existing = db
    .select()
    .from(misconceptions)
    .where(
      and(
        eq(misconceptions.studentId, studentId),
        eq(misconceptions.conceptId, m.conceptId),
        eq(misconceptions.errorForm, m.errorForm),
      ),
    )
    .get();

  const now = new Date();

  if (existing) {
    // Merge evidence: union of existing + new, FIFO capped.
    const existingEvidence = existing.evidenceJson as string[];
    const newEvidence = [...new Set([...existingEvidence, ...m.evidenceEventIds])];
    const capped =
      newEvidence.length > MAX_EVIDENCE
        ? newEvidence.slice(newEvidence.length - MAX_EVIDENCE)
        : newEvidence;

    db.update(misconceptions)
      .set({
        evidenceJson: capped,
        lastObservedAt: now,
        // Preserve description, status, firstObservedAt — do NOT overwrite.
      })
      .where(eq(misconceptions.id, existing.id))
      .run();

    return { misconceptionId: existing.id, merged: true };
  }

  const newId = uuidv7();
  db.insert(misconceptions)
    .values({
      id: newId,
      studentId,
      conceptId: m.conceptId,
      description: m.description,
      errorForm: m.errorForm,
      remediationJson: m.remediation,
      evidenceJson: m.evidenceEventIds.slice(0, MAX_EVIDENCE),
      status: "active",
      firstObservedAt: now,
      lastObservedAt: now,
    })
    .run();

  return { misconceptionId: newId, merged: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function noopDispatch(): Promise<{
  ok: false;
  error: { code: string; message: string; recoverable: boolean };
}> {
  return {
    ok: false,
    error: { code: "no_tools", message: "indexer has no tools", recoverable: false },
  };
}

function parseMisconceptionOutput(text: string, log: Logger): ParsedMisconception[] | null {
  // Extract fenced JSON block.
  const fence = text.match(/```json\n?([\s\S]*?)\n?```/);
  let jsonText: string | null = null;

  if (fence?.[1]) {
    jsonText = fence[1].trim();
  } else {
    // Fallback: find a JSON array [...] in the text.
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      jsonText = text.slice(start, end + 1);
    }
  }

  if (!jsonText) {
    log.warn("misconception.no_json_block_found", {});
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    log.warn("misconception.json_parse_error", {});
    return null;
  }

  const parsed = MisconceptionListSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn("misconception.schema_validation_failed", { errors: parsed.error.flatten() });
    return null;
  }

  return parsed.data;
}

function buildTranscriptPrompt(
  ctx: IndexerContext,
  conceptCatalog: ReadonlyArray<{ id: string; name: string }>,
): string {
  const catalogSection = `Concept catalog (use exact IDs):\n${conceptCatalog.map((c) => `- id: ${c.id}, name: ${c.name}`).join("\n")}`;

  // Filter to message/tool events; build transcript lines.
  const relevantTypes = new Set(["user_message", "model_message", "tool_call", "tool_result"]);

  const lines: string[] = [];
  for (const { id, turnIndex, event } of ctx.events) {
    if (!relevantTypes.has(event.type)) continue;

    let line: string;
    switch (event.type) {
      case "user_message":
        line = `[${id}] turn:${turnIndex} STUDENT: ${event.content}`;
        break;
      case "model_message":
        line = `[${id}] turn:${turnIndex} TUTOR: ${event.content}`;
        break;
      case "tool_call":
        line = `[${id}] turn:${turnIndex} TOOL_CALL: ${event.toolName}(${JSON.stringify(event.args)})`;
        break;
      case "tool_result":
        line = `[${id}] turn:${turnIndex} TOOL_RESULT: ${JSON.stringify(event.result)}`;
        break;
      default:
        continue;
    }
    lines.push(line);
  }

  let transcript = lines.join("\n");

  // Truncate from the start to keep the most recent events within token budget.
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    const truncated = transcript.slice(transcript.length - MAX_TRANSCRIPT_CHARS);
    // Trim to a clean line boundary.
    const firstNewline = truncated.indexOf("\n");
    transcript =
      "[TRANSCRIPT TRUNCATED — showing most recent events]\n" +
      (firstNewline === -1 ? truncated : truncated.slice(firstNewline + 1));
  }

  return `${catalogSection}\n\nSession transcript:\n${transcript}`;
}
