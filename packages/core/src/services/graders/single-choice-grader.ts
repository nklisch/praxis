import type {
  AssignmentItem,
  AssignmentResponse,
  SingleChoiceItem,
} from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * SingleChoiceGrader — exact index match.
 *
 * Reads `item.correctOptionIndex`; returns score=1 when `response.response`
 * parses to that index, 0 otherwise. No LLM involved.
 *
 * Phase 17: renamed from MultipleChoiceGrader. Kind is now "single-choice".
 * requireReasoning blending is handled upstream by AssignmentServiceImpl.submit.
 */
export class SingleChoiceGrader implements ItemGrader {
  readonly kind = "single-choice" as const;

  async grade({
    item,
    response,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const sc = item as SingleChoiceItem;
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
    const correct = chosen === sc.correctOptionIndex;
    return {
      score: correct ? 1 : 0,
      feedback: correct
        ? "Correct."
        : `Incorrect. The correct option was: ${sc.options[sc.correctOptionIndex] ?? `option ${sc.correctOptionIndex}`}`,
      tier: "deterministic",
    };
  }
}
