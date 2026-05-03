import type { AssignmentItem, AssignmentResponse, TwoTierItem } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * TwoTierGrader — grades a two-tier diagnostic item.
 *
 * Scoring:
 * - Both tiers correct → 1.0
 * - Tier-1 correct, tier-2 wrong → 0.5
 * - Tier-1 wrong → 0.0 (regardless of tier-2)
 *
 * Misconception evidence:
 * When tier-2 is wrong and misconceptionByReasonIndex[tier2Index] is non-null,
 * the grader sets `misconceptionId` on the result. AssignmentServiceImpl.submit
 * logs it for later memory wiring.
 *
 * The student response is expected to be a JSON string:
 *   { tier1Index: number; tier2Index: number }
 *
 * Phase 17: requireReasoning blending is handled upstream by AssignmentServiceImpl.
 */
export class TwoTierGrader implements ItemGrader {
  readonly kind = "two-tier" as const;

  async grade({
    item,
    response,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const tt = item as TwoTierItem;

    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }

    let parsed: { tier1Index: number; tier2Index: number };
    try {
      parsed = JSON.parse(response.response);
      if (typeof parsed.tier1Index !== "number" || typeof parsed.tier2Index !== "number") {
        return {
          score: 0,
          feedback: "Response must include tier1Index and tier2Index as numbers.",
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

    const { tier1Index, tier2Index } = parsed;
    const tier1Ok = tier1Index === tt.correctOptionIndex;
    const tier2Ok = tier2Index === tt.correctReasonIndex;

    const score: number = tier1Ok && tier2Ok ? 1.0 : tier1Ok ? 0.5 : 0.0;

    // Misconception evidence: tier-2 wrong with a mapped misconception id.
    const misconceptionId: string | null =
      !tier2Ok && tier2Index >= 0 && tier2Index < tt.misconceptionByReasonIndex.length
        ? (tt.misconceptionByReasonIndex[tier2Index] ?? null)
        : null;

    const correctAnswer = tt.options[tt.correctOptionIndex] ?? `option ${tt.correctOptionIndex}`;
    const correctReason =
      tt.reasonOptions[tt.correctReasonIndex] ?? `reason ${tt.correctReasonIndex}`;

    let feedback: string;
    if (tier1Ok && tier2Ok) {
      feedback = "Correct — right answer and right reasoning.";
    } else if (tier1Ok) {
      feedback = `Correct answer, but wrong reasoning. The correct reason was: ${correctReason}.`;
    } else {
      feedback = `Incorrect. The correct answer was: ${correctAnswer}. The correct reason was: ${correctReason}.`;
    }

    return {
      score,
      feedback,
      tier: "deterministic",
      ...(misconceptionId !== null && { misconceptionId }),
    };
  }
}
