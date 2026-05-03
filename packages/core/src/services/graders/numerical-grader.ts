import type { AssignmentItem, AssignmentResponse, NumericalItem } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * NumericalGrader — value within tolerance, optional units match, optional sig-figs check.
 *
 * Grading rules:
 * 1. Value: |studentValue - expectedValue| ≤ tolerance (default 0).
 * 2. Units: case-insensitive exact string match when expectedUnits is set.
 * 3. Sig figs: countSigFigs(studentValue) === significantFigures when set.
 *
 * Score: 1.0 when all applicable checks pass; 0 otherwise.
 * Returns needs-human-review when the student's response can't be parsed as a number.
 */
export class NumericalGrader implements ItemGrader {
  readonly kind = "numerical" as const;

  async grade({
    item,
    response,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const num = item as NumericalItem;

    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }

    // Parse the response. Expected format: "42.0" or "42.0 kg" (value then optional units).
    const responseText = response.response.trim();
    const parts = responseText.split(/\s+/, 2);
    const valueStr = parts[0] ?? "";
    const unitsStr = parts[1] ?? "";

    const studentValue = Number(valueStr);
    if (Number.isNaN(studentValue)) {
      return {
        score: null,
        feedback: `needs-human-review (could not parse "${valueStr}" as a number)`,
        tier: "needs-human-review",
      };
    }

    const tol = num.tolerance ?? 0;
    const valueOk = Math.abs(studentValue - num.expectedValue) <= tol;

    const unitsOk =
      !num.expectedUnits || unitsStr.toLowerCase() === num.expectedUnits.toLowerCase();

    const sigFigsOk = !num.significantFigures || countSigFigs(valueStr) === num.significantFigures;

    const allOk = valueOk && unitsOk && sigFigsOk;

    if (allOk) {
      return { score: 1, feedback: "Correct.", tier: "deterministic" };
    }

    const issues: string[] = [];
    if (!valueOk) {
      issues.push(
        `Value ${studentValue} is outside the accepted range (expected ${num.expectedValue}${tol > 0 ? ` ± ${tol}` : ""}).`,
      );
    }
    if (!unitsOk) {
      issues.push(`Units "${unitsStr || "(none)"}" do not match expected "${num.expectedUnits}".`);
    }
    if (!sigFigsOk) {
      issues.push(
        `Significant figures: got ${countSigFigs(valueStr)}, expected ${num.significantFigures}.`,
      );
    }

    return {
      score: 0,
      feedback: `Incorrect. ${issues.join(" ")}`,
      tier: "deterministic",
    };
  }
}

/**
 * Count significant figures in a numeric string.
 * Rules:
 * - Leading zeros are not significant.
 * - Trailing zeros after a decimal point ARE significant.
 * - Interior zeros (between non-zero digits) ARE significant.
 * - Trailing zeros without a decimal point are ambiguous; this implementation
 *   treats them as significant (conservative).
 */
export function countSigFigs(valueStr: string): number {
  // Strip sign and leading/trailing whitespace.
  const s = valueStr
    .trim()
    .replace(/^[+-]/, "")
    .replace(/e[+-]?\d+$/i, "");

  if (!s || s === "0" || /^0+$/.test(s)) return 1;

  // Remove decimal point for counting.
  const digits = s.replace(".", "");
  // Strip leading zeros.
  const stripped = digits.replace(/^0+/, "");
  return stripped.length;
}
