import type { AssignmentItem, AssignmentResponse } from "../../types/artifacts.js";
import { runRubricAgent } from "./rubric-agent.js";
import { matchAcceptedAnswer } from "./short-answer-grader.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * FreeResponseGrader — grades free-form text responses.
 *
 * Priority order:
 *   1. If `item.rubric` is set: run rubric agent (per-criterion 0-10 → weighted sum).
 *   2. If `item.acceptedAnswers` is set: normalized-match fallback (quiz/homework only).
 *   3. Otherwise: `needs-human-review`.
 *
 * Exam mode note: item-create validation (validateItems in assignment-service.ts)
 * rejects exam free-response items without a rubric. By the time grading runs in
 * exam mode, `item.rubric` is guaranteed present — no special-casing needed here.
 */
export class FreeResponseGrader implements ItemGrader {
  readonly kind = "free-response" as const;

  async grade({
    item,
    response,
    ctx,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No response provided.", tier: "deterministic" };
    }

    // Path 1: rubric agent (preferred — richer per-criterion feedback).
    if (item.rubric) {
      return runRubricAgent({
        item,
        rubric: item.rubric,
        text: response.response,
        source: "rubric",
        ctx,
      });
    }

    // Path 2: acceptedAnswers fallback (quiz/homework only; exam items must have a rubric).
    if (item.acceptedAnswers && item.acceptedAnswers.length > 0) {
      const ok = matchAcceptedAnswer(
        response.response,
        item.acceptedAnswers,
        item.acceptedAnswerMatch ?? "normalized",
      );
      return {
        score: ok ? 1 : 0,
        feedback: ok
          ? "Correct."
          : `Incorrect. Expected one of: ${item.acceptedAnswers.join(", ")}`,
        tier: "deterministic",
      };
    }

    // Path 3: no grading signal available.
    return {
      score: null,
      feedback: "needs-human-review (free-response item has no rubric or acceptedAnswers)",
      tier: "needs-human-review",
    };
  }
}
