import type { SymPyService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { verifyLatex } from "../latex-verify.js";

const makeSympy = (overrides: Partial<SymPyService> = {}): SymPyService => ({
  checkSolution: vi.fn(),
  solveEquation: vi.fn(),
  simplify: vi.fn(),
  checkEquivalent: vi.fn(),
  parseLatex: vi.fn(),
  ...overrides,
});

describe("verifyLatex", () => {
  it("returns parsed: true with expression and normalizedLatex when sympy succeeds", async () => {
    const sympy = makeSympy({
      parseLatex: vi.fn().mockResolvedValue({
        sympyExpression: "2*x + 5",
        normalizedLatex: "2x+5",
      }),
    });

    const result = await verifyLatex({ latex: "2x+5" }, sympy);
    expect(result.parsed).toBe(true);
    expect(result.sympyExpression).toBe("2*x + 5");
    expect(result.normalizedLatex).toBe("2x+5");
    expect(result.roundTripDivergent).toBeUndefined();
  });

  it("returns parsed: false with parseError when sympy returns a parseError", async () => {
    const sympy = makeSympy({
      parseLatex: vi.fn().mockResolvedValue({
        sympyExpression: "",
        normalizedLatex: "",
        parseError: "SyntaxError: unexpected token",
      }),
    });

    const result = await verifyLatex({ latex: "not valid latex" }, sympy);
    expect(result.parsed).toBe(false);
    expect(result.parseError).toBe("SyntaxError: unexpected token");
    expect(result.sympyExpression).toBeUndefined();
  });

  it("sets roundTripDivergent: true when normalized LaTeX is substantially different", async () => {
    const sympy = makeSympy({
      parseLatex: vi.fn().mockResolvedValue({
        sympyExpression: "z + 1",
        normalizedLatex: "z + 1",
        // no parseError
      }),
    });

    // Input is "2x + 5" but normalized is "z + 1" — clearly different
    const result = await verifyLatex({ latex: "2x+5" }, sympy);
    expect(result.parsed).toBe(true);
    expect(result.roundTripDivergent).toBe(true);
  });

  it("does NOT set roundTripDivergent when whitespace differences only", async () => {
    const sympy = makeSympy({
      parseLatex: vi.fn().mockResolvedValue({
        sympyExpression: "2*x + 5",
        normalizedLatex: "2 x + 5", // whitespace difference from "2x+5"
      }),
    });

    const result = await verifyLatex({ latex: "2x+5" }, sympy);
    expect(result.parsed).toBe(true);
    // whitespace is stripped in normalization, so should be equivalent
    expect(result.roundTripDivergent).toBeUndefined();
  });
});
