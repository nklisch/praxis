import type { AssignmentItem, AssignmentResponse, MathItem } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * MathGrader — calls SymPyService.checkSolution to verify the student's answer.
 *
 * Reads `item.expectedSolution` (variable + expected value).
 * The item.prompt is treated as the equation/expression to evaluate against.
 *
 * Design note: the prompt contains the equation in a form SymPy can parse
 * (e.g. "2*x + 5 = 11"). A future iteration may add a separate `equation`
 * field; for now, prompt serves double duty as displayed question + equation.
 *
 * Returns `needs-human-review` on parse errors (SymPy couldn't parse the input).
 * Returns score=0 for wrong answers, score=1 for correct ones.
 */
export class MathGrader implements ItemGrader {
  readonly kind = "math" as const;

  async grade({
    item,
    response,
    ctx,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const mi = item as MathItem;
    if (!mi.expectedSolution) {
      return {
        score: null,
        feedback: "needs-human-review (expectedSolution not configured)",
        tier: "needs-human-review",
      };
    }
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }

    const result = await ctx.services.sympy.checkSolution({
      equation: mi.prompt,
      variable: mi.expectedSolution.variable,
      proposedValue: response.response,
    });

    if (result.needsHumanReview) {
      return {
        score: null,
        feedback: `needs-human-review (parse error: ${result.parseError ?? "unknown"})`,
        tier: "needs-human-review",
      };
    }

    return {
      score: result.correct ? 1 : 0,
      feedback: result.correct
        ? "Correct."
        : `Incorrect. Expected: ${result.expectedSolutions.join(", ")}`,
      tier: "deterministic",
    };
  }
}
