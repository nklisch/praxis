import type { AssignmentItem, AssignmentResponse, MultiSelectItem } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * MultiSelectGrader — Jaccard similarity for partial credit.
 *
 * score = |selected ∩ correct| / |selected ∪ correct|
 *
 * Edge cases:
 * - Empty selection: score = 0 (union = correctOptionIndices.size, intersection = 0).
 * - No correct options defined (empty array): needs-human-review.
 * - Union size 0 (impossible when correctOptionIndices is non-empty, but guarded).
 *
 * Phase 17: requireReasoning blending is handled upstream by AssignmentServiceImpl.
 */
export class MultiSelectGrader implements ItemGrader {
  readonly kind = "multi-select" as const;

  async grade({
    item,
    response,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const ms = item as MultiSelectItem;
    if (ms.correctOptionIndices.length === 0) {
      return {
        score: null,
        feedback: "needs-human-review (no answer key — correctOptionIndices is empty)",
        tier: "needs-human-review",
      };
    }
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }

    // Parse the response: expect a JSON array of indices, or a comma-separated list.
    let selectedIndices: number[];
    try {
      const parsed = JSON.parse(response.response);
      if (!Array.isArray(parsed)) {
        return {
          score: 0,
          feedback: "Response could not be parsed as an array of option indices.",
          tier: "deterministic",
        };
      }
      selectedIndices = parsed.map(Number).filter((n) => !Number.isNaN(n));
    } catch {
      // Fallback: try comma-separated integers.
      selectedIndices = response.response
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n));
      if (selectedIndices.length === 0) {
        return {
          score: 0,
          feedback: "Response could not be parsed as option indices.",
          tier: "deterministic",
        };
      }
    }

    const correct = new Set(ms.correctOptionIndices);
    const selected = new Set(selectedIndices);

    const intersectionSize = [...selected].filter((i) => correct.has(i)).length;
    const unionSize = new Set([...correct, ...selected]).size;

    const score = unionSize === 0 ? 0 : intersectionSize / unionSize;

    const correctList = ms.correctOptionIndices
      .map((i) => ms.options[i] ?? `option ${i}`)
      .join(", ");

    const feedback =
      score === 1
        ? "Correct."
        : score === 0
          ? `Incorrect. Correct answers: ${correctList}.`
          : `Partially correct (${Math.round(score * 100)}%). Correct answers: ${correctList}.`;

    return { score, feedback, tier: "deterministic" };
  }
}
