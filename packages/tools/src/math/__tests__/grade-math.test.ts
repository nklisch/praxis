import type { SymPyService, ToolContext } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { gradeMathInput, gradeMathTool } from "../grade-math.js";

// Mock SymPyService
const mockSympy: SymPyService = {
  checkSolution: vi.fn().mockResolvedValue({
    correct: true,
    proposedValue: "3",
    expectedSolutions: ["3"],
  }),
  solveEquation: vi.fn().mockResolvedValue({
    solutions: ["3"],
  }),
  simplify: vi.fn().mockResolvedValue({
    simplified: "2*x",
    simplifiedLatex: "2 x",
  }),
  checkEquivalent: vi.fn().mockResolvedValue({
    equivalent: true,
    difference: "0",
  }),
  parseLatex: vi.fn().mockResolvedValue({
    sympyExpression: "2*x + 5",
    normalizedLatex: "2 x + 5",
  }),
};

const mockCtx: ToolContext = {
  studentId: brandId<"StudentId">("student-1"),
  sessionId: brandId<"SessionId">("session-1"),
  services: {
    // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in this test
    memory: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in this test
    artifacts: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in this test
    bootstrap: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in this test
    courseState: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 5 placeholder — not used in this test
    vectorStore: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 5 placeholder — not used in this test
    ftsStore: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 5 placeholder — not used in this test
    embeddings: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 5 placeholder — not used in this test
    documents: null as any,
    sympy: mockSympy,
    sandbox: { run: vi.fn() },
    pedagogyPack: null,
      lock: null as any,
      authoring: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder — not used in this test
    packs: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 8 placeholder — not used in this test
    assignments: null as any,
  },
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};

describe("gradeMathTool", () => {
  it("has correct name", () => {
    expect(gradeMathTool.name).toBe("grade_math");
  });

  it("has tier: deterministic", () => {
    expect(gradeMathTool.tier).toBe("deterministic");
  });

  it("has effects: external.code-exec", () => {
    expect(gradeMathTool.effects).toContain("external.code-exec");
  });
});

describe("gradeMathTool handler — check_solution", () => {
  it("dispatches to sympy.checkSolution and returns result with kind discriminator", async () => {
    vi.mocked(mockSympy.checkSolution).mockResolvedValueOnce({
      correct: true,
      proposedValue: "3",
      expectedSolutions: ["3"],
    });

    const result = await gradeMathTool.handler(
      { kind: "check_solution", equation: "2*x + 5 = 11", variable: "x", proposedValue: "3" },
      mockCtx,
    );

    expect(mockSympy.checkSolution).toHaveBeenCalledWith({
      equation: "2*x + 5 = 11",
      variable: "x",
      proposedValue: "3",
    });
    expect(result.kind).toBe("check_solution");
    if (result.kind === "check_solution") {
      expect(result.correct).toBe(true);
      expect(result.proposedValue).toBe("3");
      expect(result.expectedSolutions).toEqual(["3"]);
    }
  });

  it("forwards isLatex only when defined", async () => {
    vi.mocked(mockSympy.checkSolution).mockResolvedValueOnce({
      correct: false,
      proposedValue: "4",
      expectedSolutions: ["3"],
    });

    await gradeMathTool.handler(
      {
        kind: "check_solution",
        equation: "2x + 5 = 11",
        variable: "x",
        proposedValue: "4",
        isLatex: true,
      },
      mockCtx,
    );

    expect(mockSympy.checkSolution).toHaveBeenCalledWith(
      expect.objectContaining({ isLatex: true }),
    );
  });

  it("does NOT forward isLatex when undefined", async () => {
    vi.mocked(mockSympy.checkSolution).mockResolvedValueOnce({
      correct: true,
      proposedValue: "3",
      expectedSolutions: ["3"],
    });

    await gradeMathTool.handler(
      { kind: "check_solution", equation: "2*x + 5 = 11", variable: "x", proposedValue: "3" },
      mockCtx,
    );

    const callArgs = vi.mocked(mockSympy.checkSolution).mock.calls.at(-1)?.[0];
    expect(callArgs).not.toHaveProperty("isLatex");
  });

  it("propagates needsHumanReview and parseError from service", async () => {
    vi.mocked(mockSympy.checkSolution).mockResolvedValueOnce({
      correct: false,
      proposedValue: "",
      expectedSolutions: [],
      needsHumanReview: true,
      parseError: "SyntaxError: garbage",
    });

    const result = await gradeMathTool.handler(
      { kind: "check_solution", equation: "garbage", variable: "x", proposedValue: "1" },
      mockCtx,
    );

    if (result.kind === "check_solution") {
      expect(result.needsHumanReview).toBe(true);
      expect(result.parseError).toBe("SyntaxError: garbage");
    }
  });
});

describe("gradeMathTool handler — solve_equation", () => {
  it("dispatches to sympy.solveEquation and returns result with kind", async () => {
    vi.mocked(mockSympy.solveEquation).mockResolvedValueOnce({ solutions: ["-2", "2"] });

    const result = await gradeMathTool.handler(
      { kind: "solve_equation", equation: "x**2 - 4 = 0", variable: "x" },
      mockCtx,
    );

    expect(result.kind).toBe("solve_equation");
    if (result.kind === "solve_equation") {
      expect(result.solutions).toEqual(["-2", "2"]);
    }
  });
});

describe("gradeMathTool handler — simplify", () => {
  it("dispatches to sympy.simplify and returns result with kind", async () => {
    vi.mocked(mockSympy.simplify).mockResolvedValueOnce({
      simplified: "2*x",
      simplifiedLatex: "2 x",
    });

    const result = await gradeMathTool.handler(
      { kind: "simplify", expression: "(x+1)**2 - x**2 - 1" },
      mockCtx,
    );

    expect(result.kind).toBe("simplify");
    if (result.kind === "simplify") {
      expect(result.simplified).toBe("2*x");
      expect(result.simplifiedLatex).toBe("2 x");
    }
  });
});

describe("gradeMathTool handler — check_equivalent", () => {
  it("dispatches to sympy.checkEquivalent and returns result with kind", async () => {
    vi.mocked(mockSympy.checkEquivalent).mockResolvedValueOnce({
      equivalent: true,
      difference: "0",
    });

    const result = await gradeMathTool.handler(
      { kind: "check_equivalent", expression1: "(x+1)**2", expression2: "x**2 + 2*x + 1" },
      mockCtx,
    );

    expect(result.kind).toBe("check_equivalent");
    if (result.kind === "check_equivalent") {
      expect(result.equivalent).toBe(true);
      expect(result.difference).toBe("0");
    }
  });
});

describe("gradeMathInput Zod validation", () => {
  it("rejects missing variable for check_solution", () => {
    const parse = gradeMathInput.safeParse({
      kind: "check_solution",
      equation: "2*x = 4",
      proposedValue: "2",
      // missing: variable
    });
    expect(parse.success).toBe(false);
  });

  it("rejects unknown kind", () => {
    const parse = gradeMathInput.safeParse({
      kind: "unknown_op",
      expression: "x + 1",
    });
    expect(parse.success).toBe(false);
  });

  it("accepts valid check_solution", () => {
    const parse = gradeMathInput.safeParse({
      kind: "check_solution",
      equation: "2*x = 4",
      variable: "x",
      proposedValue: "2",
    });
    expect(parse.success).toBe(true);
  });
});
