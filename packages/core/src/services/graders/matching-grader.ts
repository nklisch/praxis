import type { AssignmentItem, AssignmentResponse, MatchingItem } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * MatchingGrader — fraction of correct pairs.
 *
 * score = (number of correct pairs submitted) / (total correct pairs in item)
 *
 * The student response is expected to be a JSON string representing:
 *   Array<{ leftId: string; rightId: string }>
 *
 * A pair is correct when the (leftId, rightId) combination appears in
 * item.correctPairs.
 */
export class MatchingGrader implements ItemGrader {
  readonly kind = "matching" as const;

  async grade({
    item,
    response,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const match = item as MatchingItem;

    if (match.correctPairs.length === 0) {
      return {
        score: null,
        feedback: "needs-human-review (no correct pairs defined)",
        tier: "needs-human-review",
      };
    }
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }

    let submittedPairs: Array<{ leftId: string; rightId: string }>;
    try {
      const parsed: unknown = JSON.parse(response.response);
      if (!Array.isArray(parsed) || !parsed.every(isMatchingPair)) {
        return {
          score: 0,
          feedback: "Response could not be parsed as an array of pairs.",
          tier: "deterministic",
        };
      }
      submittedPairs = parsed;
    } catch {
      return {
        score: 0,
        feedback: "Response could not be parsed as JSON.",
        tier: "deterministic",
      };
    }

    const correctSet = new Set(match.correctPairs.map((p) => `${p.leftId}|${p.rightId}`));
    if (correctSet.size === 0) {
      return {
        score: null,
        feedback: "needs-human-review (no unique correct pairs defined)",
        tier: "needs-human-review",
      };
    }
    const submittedSet = new Set(submittedPairs.map((p) => `${p.leftId}|${p.rightId}`));
    const correctCount = Array.from(submittedSet).filter((pair) => correctSet.has(pair)).length;

    const score = clamp01(correctCount / correctSet.size);

    const feedback =
      score === 1
        ? "Correct."
        : score === 0
          ? "No pairs matched correctly."
          : `Partially correct: ${correctCount} of ${correctSet.size} pairs matched.`;

    return { score, feedback, tier: "deterministic" };
  }
}

function isMatchingPair(value: unknown): value is { leftId: string; rightId: string } {
  if (typeof value !== "object" || value === null) return false;
  const pair = value as { leftId?: unknown; rightId?: unknown };
  return typeof pair.leftId === "string" && typeof pair.rightId === "string";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
