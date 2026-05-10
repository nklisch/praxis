/**
 * runRubricAgent — shared per-criterion 0-10 grader helper.
 *
 * Used by:
 *   - FreeResponseGrader (for item.rubric)
 *   - AssignmentServiceImpl.submit (for item.workRubric blending on math/code items)
 *
 * The rubric agent produces per-criterion integer scores; the aggregate 0..1
 * score is computed DETERMINISTICALLY here via weighted sum. The agent never
 * produces a total.
 *
 * Isolation pattern: same as Phase 7's MisconceptionIndexer — runOneShot with
 * a noop tool registry, drain to full assistantText, parse fenced JSON.
 */

import { runOneShot } from "@praxis/engines";
import { z } from "zod";
import type { AssignmentItem, Rubric } from "../../types/artifacts.js";
import { extractJsonBlock } from "../llm-helpers.js";
import { RUBRIC_SYSTEM_PROMPT } from "./rubric-prompt.js";
import type { GraderContext, GraderResult } from "./types.js";

/**
 * Schema for the rubric agent's output: an entry per criterion with integer
 * 0-10 score and a written rationale. NO total score — the service computes
 * the weighted aggregate deterministically from the per-criterion scores.
 */
const RubricResultSchema = z.object({
  perCriterion: z
    .array(
      z.object({
        criterionId: z.string().min(1),
        score: z.number().int().min(0).max(10),
        rationale: z.string().min(1),
      }),
    )
    .min(1),
  /** Optional one-paragraph overall narrative (the agent may produce one). */
  feedback: z.string().min(1).optional(),
});

export interface RunRubricAgentInput {
  /** Item context — used in the prompt so the agent knows what was asked. */
  item: AssignmentItem;
  rubric: Rubric;
  /**
   * What the student wrote. For free-response: the response text.
   * For workRubric on math/code: the work text (shown work / derivation).
   */
  text: string;
  /** Tag identifying which rubric this is — propagated to GradeItem.perCriterion[i].source. */
  source: "rubric" | "work-rubric" | "reasoning-rubric";
  ctx: GraderContext;
}

/**
 * Run the rubric agent on a (item, rubric, text) triple.
 *
 * Returns a GraderResult with `perCriterion` populated and `score` computed
 * deterministically as: total = Σ((criterion.score / 10) × criterion.weight).
 *
 * Failures (engine error, schema-invalid output, no valid criteria) all return
 * `needs-human-review` so the assignment can still complete and other items
 * grade normally. Only this item's score is null.
 */
export async function runRubricAgent(input: RunRubricAgentInput): Promise<GraderResult> {
  const { item, rubric, text, source, ctx } = input;

  if (text.trim() === "") {
    return { score: 0, feedback: "No response provided.", tier: "deterministic" };
  }

  const userMessage = buildRubricUserMessage(item, rubric, text);
  const events = runOneShot(
    ctx.services.engineResolver(),
    {
      systemPrompt: RUBRIC_SYSTEM_PROMPT,
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
      ctx.log.warn("rubric.engine_error", { error: ev.error.message, source });
      return {
        score: null,
        feedback: `needs-human-review (rubric agent error: ${ev.error.message})`,
        tier: "needs-human-review",
      };
    }
  }

  let raw: unknown;
  try {
    raw = extractJsonBlock(assistantText);
  } catch {
    ctx.log.warn("rubric.json_parse_error", { source });
    return {
      score: null,
      feedback: "needs-human-review (rubric agent output could not be parsed as JSON)",
      tier: "needs-human-review",
    };
  }

  if (raw === null) {
    ctx.log.warn("rubric.no_json_block", { source });
    return {
      score: null,
      feedback: "needs-human-review (rubric agent produced no JSON block)",
      tier: "needs-human-review",
    };
  }

  const parsed = RubricResultSchema.safeParse(raw);
  if (!parsed.success) {
    ctx.log.warn("rubric.parse_failed", { errors: parsed.error.flatten(), source });
    return {
      score: null,
      feedback: "needs-human-review (rubric agent output failed schema validation)",
      tier: "needs-human-review",
    };
  }

  // Validate every per-criterion entry maps to a known criterion id; drop unknowns with a warn.
  const knownIds = new Set(rubric.criteria.map((c) => c.id));
  const validEntries = parsed.data.perCriterion.filter((e) => {
    if (!knownIds.has(e.criterionId)) {
      ctx.log.warn("rubric.unknown_criterion", { criterionId: e.criterionId, source });
      return false;
    }
    return true;
  });

  if (validEntries.length === 0) {
    return {
      score: null,
      feedback: "needs-human-review (rubric agent produced no valid per-criterion entries)",
      tier: "needs-human-review",
    };
  }

  // Deterministic weighted sum: total = Σ((score / 10) × weight).
  // Criteria the agent didn't score get weight 0 contribution (effectively a 0).
  const scoreById = new Map(validEntries.map((e) => [e.criterionId, e.score]));
  let total = 0;
  for (const c of rubric.criteria) {
    const s = scoreById.get(c.id) ?? 0;
    total += (s / 10) * c.weight;
  }
  // Clamp to [0..1] for floating-point safety.
  total = Math.max(0, Math.min(1, total));

  // Build feedback: prefer the agent's overall narrative if provided; otherwise compose
  // from per-criterion rationales (each criterion's description + score + rationale).
  const feedback = parsed.data.feedback ?? composeFeedbackFromCriteria(validEntries, rubric);

  return {
    score: total,
    feedback,
    tier: "rubric-agent",
    perCriterion: validEntries.map((e) => ({
      criterionId: e.criterionId,
      score: e.score,
      rationale: e.rationale,
      source,
    })),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRubricUserMessage(item: AssignmentItem, rubric: Rubric, text: string): string {
  const lines: string[] = [];

  // structured-question items are never graded; all assessment items have a prompt.
  const prompt = "prompt" in item ? (item.prompt as string) : "(no prompt)";
  lines.push("## Assignment item");
  lines.push(prompt);
  lines.push("");

  lines.push("## Rubric");
  for (const c of rubric.criteria) {
    lines.push(`**Criterion: ${c.id}** (weight: ${c.weight})`);
    lines.push(c.description);
    if (c.anchors && c.anchors.length > 0) {
      lines.push("Calibration anchors:");
      for (const a of c.anchors) {
        lines.push(`  - score ${a.score}: ${a.description}`);
      }
    }
    lines.push("");
  }

  lines.push("## Student response");
  lines.push(text);

  return lines.join("\n");
}

function composeFeedbackFromCriteria(
  entries: Array<{ criterionId: string; score: number; rationale: string }>,
  rubric: Rubric,
): string {
  const byId = new Map(rubric.criteria.map((c) => [c.id, c]));
  return entries
    .map((e) => {
      const c = byId.get(e.criterionId);
      const name = c?.description ?? e.criterionId;
      return `${name}: ${e.score}/10. ${e.rationale}`;
    })
    .join("\n");
}

async function noopDispatch(): Promise<{
  ok: false;
  error: { code: string; message: string; recoverable: boolean };
}> {
  return {
    ok: false,
    error: { code: "no_tools", message: "rubric agent has no tools", recoverable: false },
  };
}
