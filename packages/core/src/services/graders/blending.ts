import type { GraderResult } from "./types.js";

// ─── workRubric blending ───────────────────────────────────────────────────────

/**
 * Blend deterministic grader result + work-rubric agent result via primaryWeight.
 *
 * total = primaryWeight × deterministicScore + (1 - primaryWeight) × workScore
 *
 * When either side is needs-human-review (score null): fall back to the side
 * that succeeded, or null if both fail.
 */
export function blendDeterministicAndWorkRubric(
  base: GraderResult,
  work: GraderResult,
  primaryWeight: number,
): GraderResult {
  if (base.score === null || work.score === null) {
    // One side failed — use the other when available.
    if (work.score !== null) return work;
    if (base.score !== null) return base;
    return { score: null, feedback: "needs-human-review", tier: "needs-human-review" };
  }
  const blended = primaryWeight * base.score + (1 - primaryWeight) * work.score;
  const result: GraderResult = {
    score: Math.max(0, Math.min(1, blended)),
    feedback: `${base.feedback}\n\nWork: ${work.feedback}`,
    tier: "rubric-agent", // LLM was involved
  };
  if (work.perCriterion !== undefined) {
    result.perCriterion = work.perCriterion;
  }
  if (work.evidenceEventIds !== undefined) {
    result.evidenceEventIds = work.evidenceEventIds;
  }
  return result;
}
