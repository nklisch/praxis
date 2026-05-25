/**
 * AffectiveIndexer — session-end affect detection.
 *
 * Two paths run in the same pass and commit in one transaction:
 *   1. Walk the session's events for quick_check.confidence tool_call/tool_result
 *      pairs and write source:"explicit-checkin" rows for each valid check-in.
 *   2. Run a one-shot LLM over the session transcript and write one
 *      source:"model-inferred" row.
 *
 * Either path failing is non-fatal: explicit-checkin writes succeed even if the
 * model inference fails or produces unparseable output.
 *
 * Mirrors MisconceptionIndexer's structure; see that file for the canonical pattern.
 */

import { noopDispatch, runOneShot } from "@praxis/engines";
import { affectiveSamples } from "@praxis/memory/schema";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { PraxisDb } from "../../db/index.js";
import type { Engine, Indexer, IndexerContext, Logger } from "../../types/index.js";
import { AFFECTIVE_SYSTEM_PROMPT } from "./affective-prompt.js";

/**
 * Approximate token budget for the transcript portion of the user message.
 * ~4 chars per token, capped at ~25k tokens of the most recent events.
 */
const MAX_TRANSCRIPT_CHARS = 100_000;

const CONFIDENCE_TOOL_NAME = "quick_check.confidence";

/**
 * Zod schema for the one-shot model's JSON response.
 * Out-of-range values (>1 or <0) intentionally fail validation — reject, don't clamp.
 */
const AffectInferenceSchema = z.object({
  engagement: z.number().min(0).max(1),
  frustration: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().optional(),
});

type AffectInference = z.infer<typeof AffectInferenceSchema>;

export interface AffectiveIndexerDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves the active engine for the one-shot inference call. */
  engineResolver: () => Engine;
}

/** Explicit confidence check-in extracted from quick_check.confidence events. */
interface ExplicitCheckin {
  /** When the tool_result was recorded (millisecond epoch). */
  ts: Date;
  /** Normalized confidence in [0, 1]. */
  confidence: number;
}

export class AffectiveIndexer implements Indexer {
  readonly id = "affective";
  readonly schedule = "session-end" as const;

  constructor(private readonly deps: AffectiveIndexerDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    // Skip empty / tiny sessions (mirrors MisconceptionIndexer's guard).
    if (ctx.events.length < 2) return;

    const explicit = extractExplicitCheckins(ctx.events);
    const inferred = await runModelInference(this.deps, ctx);

    if (explicit.length === 0 && !inferred) return;

    const now = new Date();
    this.deps.db.transaction((tx) => {
      for (const sample of explicit) {
        tx.insert(affectiveSamples)
          .values({
            id: uuidv7(),
            studentId: ctx.studentId,
            ts: sample.ts,
            source: "explicit-checkin",
            // quick_check.confidence only captures the confidence rating.
            // Engagement and frustration default to neutral (0.5 = 500 milli).
            engagementMilli: 500,
            frustrationMilli: 500,
            confidenceMilli: Math.round(sample.confidence * 1000),
          })
          .run();
      }

      if (inferred) {
        tx.insert(affectiveSamples)
          .values({
            id: uuidv7(),
            studentId: ctx.studentId,
            ts: now,
            source: "model-inferred",
            engagementMilli: Math.round(inferred.engagement * 1000),
            frustrationMilli: Math.round(inferred.frustration * 1000),
            confidenceMilli: Math.round(inferred.confidence * 1000),
          })
          .run();
      }
    });
  }
}

// ── Explicit check-in extraction ───────────────────────────────────────────────

/**
 * Walk the events array for quick_check.confidence tool_call → tool_result pairs.
 *
 * Matching strategy:
 *   - Collect all tool_call events whose toolName === "quick_check.confidence",
 *     keyed by callId, recording the `scale` arg (defaults to "1-4").
 *   - For each tool_result event whose callId matches a known confidence call,
 *     extract the rating and convert to [0, 1].
 *   - Skip rows where rating === 0 (abandoned).
 */
export function extractExplicitCheckins(events: IndexerContext["events"]): ExplicitCheckin[] {
  // Map from callId → { scale, ts }
  const callMap = new Map<string, { scale: "1-4" | "1-5"; ts: Date }>();

  for (const { event, ts } of events) {
    if (event.type === "tool_call" && event.toolName === CONFIDENCE_TOOL_NAME) {
      const args = event.args as { scale?: string } | null;
      const scale = args?.scale === "1-5" ? "1-5" : "1-4";
      callMap.set(event.callId, { scale, ts: new Date(ts) });
    }
  }

  const checkins: ExplicitCheckin[] = [];

  for (const { event, ts } of events) {
    if (event.type !== "tool_result") continue;

    const call = callMap.get(event.callId);
    if (!call) continue;

    // tool_result.result shape: { ok: true; value: { rating: number }; tier: string } or error form
    const result = event.result as
      | { ok: true; value: { rating: number }; tier: string }
      | { ok: false }
      | undefined;

    if (!result?.ok) continue;

    const rating = result.value?.rating;
    if (typeof rating !== "number" || rating === 0) continue; // abandoned

    const max = call.scale === "1-5" ? 5 : 4;
    // Linear map: rating 1..max → 0..1
    const confidence = (rating - 1) / (max - 1);

    checkins.push({ ts: new Date(ts), confidence });
  }

  return checkins;
}

// ── Model inference ────────────────────────────────────────────────────────────

/**
 * Run a one-shot LLM call over the session transcript and parse the result.
 * Returns null on any failure (engine error, empty response, schema mismatch).
 */
async function runModelInference(
  deps: AffectiveIndexerDeps,
  ctx: IndexerContext,
): Promise<AffectInference | null> {
  const userMessage = buildTranscriptPrompt(ctx);

  const events = runOneShot(
    deps.engineResolver(),
    {
      systemPrompt: AFFECTIVE_SYSTEM_PROMPT,
      tools: {
        list: () => [],
        dispatch: noopDispatch("affective-indexer"),
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
      deps.log.warn("affective.engine_error", { error: ev.error.message });
      return null;
    }
  }

  if (!assistantText.trim()) return null;

  return parseAffectiveOutput(assistantText, deps.log);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseAffectiveOutput(text: string, log: Logger): AffectInference | null {
  // Extract fenced JSON block.
  const fence = text.match(/```json\n?([\s\S]*?)\n?```/);
  let jsonText: string | null = null;

  if (fence?.[1]) {
    jsonText = fence[1].trim();
  } else {
    // Fallback: find the first {...} JSON object in the text.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      jsonText = text.slice(start, end + 1);
    }
  }

  if (!jsonText) {
    log.warn("affective.no_json_block_found", {});
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    log.warn("affective.json_parse_error", {});
    return null;
  }

  const parsed = AffectInferenceSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn("affective.schema_validation_failed", { errors: parsed.error.flatten() });
    return null;
  }

  return parsed.data;
}

function buildTranscriptPrompt(ctx: IndexerContext): string {
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

  // Truncate from the start to keep the most recent events within the token budget.
  // The most recent turns are most diagnostic for affect — the start of a session
  // is usually neutral.
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    const truncated = transcript.slice(transcript.length - MAX_TRANSCRIPT_CHARS);
    const firstNewline = truncated.indexOf("\n");
    transcript =
      "[TRANSCRIPT TRUNCATED — showing most recent events]\n" +
      (firstNewline === -1 ? truncated : truncated.slice(firstNewline + 1));
  }

  return `Session transcript:\n${transcript}`;
}
