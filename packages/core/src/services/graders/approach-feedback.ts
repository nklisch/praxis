/**
 * enrichWithApproachFeedback — fallback enrichment layer for incorrect items
 * that have NO rubric and NO workRubric.
 *
 * Runs ONLY when all of these hold:
 *   - mode !== "exam" (verification stance — no post-hoc feedback shifting for exams)
 *   - score < 1 (no value in enriching correct answers)
 *   - tier !== "needs-human-review" (no deterministic anchor to reason from)
 *   - tier !== "rubric-agent" (per-criterion rationales already provide rich feedback)
 *   - item has no rubric AND no workRubric (rubric-graded items already have criterion feedback)
 *   - response is non-empty (no signal to reason from)
 *
 * On success: returns a new GraderResult with `feedback` replaced by the LLM's
 * enriched feedback. `score` and `tier` are unchanged.
 * On any failure: returns `base` unchanged (graceful degradation).
 *
 * This is a top-level pure function (not a class) because it has no per-item
 * state and is mode-aware logic, not item-kind-specific logic.
 */

import { runOneShot } from "@praxis/engines";
import { z } from "zod";
import type { AssignmentItem } from "../../types/artifacts.js";
import { extractJsonBlock } from "../llm-helpers.js";
import { APPROACH_SYSTEM_PROMPT } from "./approach-prompt.js";
import type { GraderContext, GraderResult } from "./types.js";

const ApproachResultSchema = z.object({
  enrichedFeedback: z.string().min(1),
});

export async function enrichWithApproachFeedback(input: {
  item: AssignmentItem;
  response: string | null;
  base: GraderResult;
  ctx: GraderContext;
}): Promise<GraderResult> {
  const { item, response, base, ctx } = input;

  // Skip rules — all must pass or we return base unchanged.
  if (ctx.mode === "exam") return base;
  if (base.score === 1) return base;
  if (base.tier === "needs-human-review") return base;
  if (base.tier === "rubric-agent") return base;
  // Skip items that already have rubric grading of any kind.
  const hasRubric =
    ("rubric" in item && item.rubric != null) ||
    ("workRubric" in item && item.workRubric != null) ||
    ("reasoningRubric" in item && item.reasoningRubric != null);
  if (hasRubric) return base;
  if (!response || response.trim() === "") return base;

  const userMessage = buildApproachUserMessage(item, response, base);
  const events = runOneShot(
    ctx.services.engineResolver(),
    {
      systemPrompt: APPROACH_SYSTEM_PROMPT,
      tools: { list: () => [], dispatch: noopDispatch },
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
      ctx.log.warn("approach.engine_error", { error: ev.error.message });
      return base; // graceful: return base on any error
    }
  }

  let raw: unknown;
  try {
    raw = extractJsonBlock(assistantText);
  } catch {
    ctx.log.warn("approach.json_parse_error", {});
    return base;
  }

  if (raw === null) {
    ctx.log.warn("approach.no_json_block", {});
    return base;
  }

  const parsed = ApproachResultSchema.safeParse(raw);
  if (!parsed.success) {
    ctx.log.warn("approach.parse_failed", { errors: parsed.error.flatten() });
    return base;
  }

  return {
    ...base,
    feedback: parsed.data.enrichedFeedback,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApproachUserMessage(
  item: AssignmentItem,
  response: string,
  base: GraderResult,
): string {
  // structured-question items are never graded; all assessment items have a prompt.
  const prompt = "prompt" in item ? (item.prompt as string) : "(no prompt)";
  return [
    "## Item prompt",
    prompt,
    "",
    "## Student response",
    response,
    "",
    "## Grader verdict",
    `Score: ${base.score ?? "null"}`,
    `Feedback: ${base.feedback}`,
  ].join("\n");
}

async function noopDispatch(): Promise<{
  ok: false;
  error: { code: string; message: string; recoverable: boolean };
}> {
  return {
    ok: false,
    error: { code: "no_tools", message: "approach agent has no tools", recoverable: false },
  };
}
