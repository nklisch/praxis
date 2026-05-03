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
      submittedPairs = JSON.parse(response.response);
      if (!Array.isArray(submittedPairs)) {
        return {
          score: 0,
          feedback: "Response could not be parsed as an array of pairs.",
          tier: "deterministic",
        };
      }
    } catch {
      return {
        score: 0,
        feedback: "Response could not be parsed as JSON.",
        tier: "deterministic",
      };
    }

    const correctSet = new Set(match.correctPairs.map((p) => `${p.leftId}|${p.rightId}`));
    const correctCount = submittedPairs.filter((p) =>
      correctSet.has(`${p.leftId}|${p.rightId}`),
    ).length;

    const score = correctCount / match.correctPairs.length;

    const feedback =
      score === 1
        ? "Correct."
        : score === 0
          ? "No pairs matched correctly."
          : `Partially correct: ${correctCount} of ${match.correctPairs.length} pairs matched.`;

    return { score, feedback, tier: "deterministic" };
  }
}
