import type { AssignmentItem, AssignmentResponse } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * ShortAnswerGrader — exact / substring / normalized match against
 * a list of accepted answers.
 *
 * Reads `item.acceptedAnswers` and `item.acceptedAnswerMatch`.
 * Default match mode is "exact" when not specified.
 * No LLM involved.
 */
export class ShortAnswerGrader implements ItemGrader {
  readonly kind = "short-answer" as const;

  async grade({
    item,
    response,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const accepted = item.acceptedAnswers ?? [];
    if (accepted.length === 0) {
      return {
        score: null,
        feedback: "needs-human-review (no answer key — acceptedAnswers not set)",
        tier: "needs-human-review",
      };
    }
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }
    const matchKind = item.acceptedAnswerMatch ?? "exact";
    const ok = matchAcceptedAnswer(response.response, accepted, matchKind);
    return {
      score: ok ? 1 : 0,
      feedback: ok ? "Correct." : `Incorrect. Expected one of: ${accepted.join(", ")}`,
      tier: "deterministic",
    };
  }
}

/**
 * Match a student response against a list of accepted answers using the
 * specified match mode. Exported for reuse in FreeResponseGrader.
 */
export function matchAcceptedAnswer(
  responseText: string,
  accepted: string[],
  match: "exact" | "substring" | "normalized",
): boolean {
  const r = responseText.trim();
  switch (match) {
    case "exact":
      return accepted.some((a) => a.trim() === r);
    case "substring":
      return accepted.some((a) => r.includes(a.trim()));
    case "normalized": {
      const norm = (s: string) =>
        s
          .toLowerCase()
          .replace(/\s+/g, " ")
          .replace(/[.,!?;:]+$/, "")
          .trim();
      return accepted.some((a) => norm(a) === norm(r));
    }
  }
}
