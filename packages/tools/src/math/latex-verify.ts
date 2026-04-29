import type { SymPyService } from "@praxis/core/types";

export interface LatexVerifyInput {
  /** The LaTeX as read from the student's work (e.g., from vision OCR). */
  latex: string;
}

export interface LatexVerifyResult {
  /** True if sympy successfully parsed the LaTeX. */
  parsed: boolean;
  /** sympy's normalized form of the input — e.g. "2*x + 5". */
  sympyExpression?: string;
  /** sympy's LaTeX rendering of the parsed form — should match the input modulo formatting. */
  normalizedLatex?: string;
  /** When true, the round-trip (LaTeX → sympy → LaTeX) yielded a substantially different form. */
  roundTripDivergent?: boolean;
  parseError?: string;
}

/**
 * Verification round-trip: parse LaTeX → sympy → re-render LaTeX, then compare.
 *
 * Used by Phase 13 vision OCR: when the model reads handwriting into LaTeX,
 * we run this helper to confirm sympy can parse what was read. If sympy
 * normalizes to a substantially different LaTeX, the OCR likely got something
 * wrong and the answer should not be confidently graded — surface as
 * `needs_human_review` to the agent.
 *
 * Phase 4 ships the helper; Phase 13 wires it into the vision OCR path.
 * Also useful right now for any tool needing a sympy-side validation of
 * user-supplied LaTeX before grading.
 */
export async function verifyLatex(
  input: LatexVerifyInput,
  sympy: SymPyService,
): Promise<LatexVerifyResult> {
  const r = await sympy.parseLatex({ latex: input.latex });
  if (r.parseError) {
    return {
      parsed: false,
      ...(r.parseError !== undefined && { parseError: r.parseError }),
    };
  }
  const divergent = !looselyEquivalent(input.latex, r.normalizedLatex);
  return {
    parsed: true,
    sympyExpression: r.sympyExpression,
    normalizedLatex: r.normalizedLatex,
    ...(divergent && { roundTripDivergent: true }),
  };
}

/**
 * Strip whitespace, lowercase, drop common formatting variants — a coarse
 * "did sympy preserve the meaning?" check. Not perfect; agents reading the
 * round-trip should treat `roundTripDivergent: true` as a warning, not proof
 * of error.
 */
function looselyEquivalent(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function normalize(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/\\,/g, "")
    .replace(/\\!/g, "")
    .replace(/\\\\/g, "")
    .toLowerCase();
}
