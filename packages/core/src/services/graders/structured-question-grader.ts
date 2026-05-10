/**
 * StructuredQuestionGrader — no-op grader for structured-question items.
 *
 * StructuredQuestionItem is not an assessment item; the model acts on the
 * student's answer rather than grading it. This grader exists solely to
 * satisfy the exhaustive `Record<AssignmentItem["kind"], ItemGrader>` registry
 * type. It should never be called at runtime — structured-question items are
 * never placed in Assignment.items.
 */
import type { AssignmentItem, AssignmentResponse } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

export class StructuredQuestionGrader implements ItemGrader {
  readonly kind = "structured-question" as const;

  async grade({
    item,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    // structured-question is not an assessment item and should never appear
    // in an Assignment.items list. If this is reached, something is wrong.
    throw new Error(
      `structured-question (id: ${item.id}) is not an assessment item and cannot be graded`,
    );
  }
}
