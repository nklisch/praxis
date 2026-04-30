import type { AssignmentItem, AssignmentResponse } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * MultipleChoiceGrader — exact index match.
 *
 * Reads `item.correctOptionIndex`; returns score=1 when `response.response`
 * parses to that index, 0 otherwise. No LLM involved.
 */
export class MultipleChoiceGrader implements ItemGrader {
  readonly kind = "multiple-choice" as const;

  async grade({
    item,
    response,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    if (item.correctOptionIndex === undefined) {
      return {
        score: null,
        feedback: "needs-human-review (no answer key — correctOptionIndex not set)",
        tier: "needs-human-review",
      };
    }
    if (!response) {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }
    const chosen = Number(response.response);
    if (Number.isNaN(chosen)) {
      return {
        score: 0,
        feedback: "Response could not be parsed as an option index.",
        tier: "deterministic",
      };
    }
    const correct = chosen === item.correctOptionIndex;
    return {
      score: correct ? 1 : 0,
      feedback: correct
        ? "Correct."
        : `Incorrect. The correct option was: ${item.options?.[item.correctOptionIndex] ?? `option ${item.correctOptionIndex}`}`,
      tier: "deterministic",
    };
  }
}
