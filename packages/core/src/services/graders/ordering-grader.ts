import type { AssignmentItem, AssignmentResponse, OrderingItem } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * OrderingGrader — fraction of correct positions.
 *
 * score = (number of items in correct position) / (total items)
 *
 * The student response is expected to be a JSON string representing:
 *   string[]  (array of item ids in the student's submitted order)
 *
 * If the submitted order has a different length than correctOrder, score = 0.
 */
export class OrderingGrader implements ItemGrader {
  readonly kind = "ordering" as const;

  async grade({
    item,
    response,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const ord = item as OrderingItem;

    if (ord.correctOrder.length === 0) {
      return {
        score: null,
        feedback: "needs-human-review (no correct order defined)",
        tier: "needs-human-review",
      };
    }
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }

    let submittedOrder: string[];
    try {
      submittedOrder = JSON.parse(response.response);
      if (!Array.isArray(submittedOrder)) {
        return {
          score: 0,
          feedback: "Response could not be parsed as an array of item ids.",
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

    if (submittedOrder.length !== ord.correctOrder.length) {
      return {
        score: 0,
        feedback: `Ordering must include every item exactly once (expected ${ord.correctOrder.length} items, got ${submittedOrder.length}).`,
        tier: "deterministic",
      };
    }

    const matches = submittedOrder.filter((id, i) => id === ord.correctOrder[i]).length;
    const score = matches / ord.correctOrder.length;

    const feedback =
      score === 1
        ? "Correct."
        : score === 0
          ? "No items were in the correct position."
          : `Partially correct: ${matches} of ${ord.correctOrder.length} items in the correct position.`;

    return { score, feedback, tier: "deterministic" };
  }
}
