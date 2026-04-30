import { describe, expect, it, vi } from "vitest";
import type { AssignmentItem, AssignmentResponse } from "../../../types/artifacts.js";
import type { SymPyCheckSolutionResult } from "../../../types/tool.js";
import { MathGrader } from "../math-grader.js";
import type { GraderContext, GraderServices } from "../types.js";

function makeItem(overrides: Partial<AssignmentItem> = {}): AssignmentItem {
  return {
    id: "item-1",
    kind: "math",
    prompt: "2*x + 5 = 11",
    expectedSolution: { variable: "x", value: "3" },
    ...overrides,
  };
}

function makeResponse(response: string): AssignmentResponse {
  return {
    assignmentId: "assign-1" as AssignmentResponse["assignmentId"],
    itemId: "item-1",
    response,
    recordedAt: Date.now() as AssignmentResponse["recordedAt"],
  };
}

function makeCtx(sympyResult: SymPyCheckSolutionResult): GraderContext {
  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    services: {
      sympy: {
        checkSolution: vi.fn().mockResolvedValue(sympyResult),
      } as unknown as GraderServices["sympy"],
      sandbox: {} as GraderServices["sandbox"],
      engineResolver: vi.fn(),
    },
    mode: "quiz",
  };
}

describe("MathGrader", () => {
  const grader = new MathGrader();

  it("returns score=1 for correct answer", async () => {
    const ctx = makeCtx({ correct: true, proposedValue: "3", expectedSolutions: ["3"] });
    const result = await grader.grade({ item: makeItem(), response: makeResponse("3"), ctx });
    expect(result.score).toBe(1);
    expect(result.tier).toBe("deterministic");
    expect(result.feedback).toBe("Correct.");
  });

  it("returns score=0 for wrong answer with expected solutions in feedback", async () => {
    const ctx = makeCtx({ correct: false, proposedValue: "2", expectedSolutions: ["3"] });
    const result = await grader.grade({ item: makeItem(), response: makeResponse("2"), ctx });
    expect(result.score).toBe(0);
    expect(result.tier).toBe("deterministic");
    expect(result.feedback).toContain("3");
  });

  it("returns needs-human-review on parse error", async () => {
    const ctx = makeCtx({
      correct: false,
      proposedValue: "",
      expectedSolutions: [],
      needsHumanReview: true,
      parseError: "unexpected token",
    });
    const result = await grader.grade({ item: makeItem(), response: makeResponse("???"), ctx });
    expect(result.score).toBeNull();
    expect(result.tier).toBe("needs-human-review");
    expect(result.feedback).toContain("unexpected token");
  });

  it("returns score=0 for empty response", async () => {
    const ctx = makeCtx({ correct: false, proposedValue: "", expectedSolutions: [] });
    const result = await grader.grade({ item: makeItem(), response: makeResponse(""), ctx });
    expect(result.score).toBe(0);
    expect(result.feedback).toContain("No answer");
  });

  it("returns score=0 for null response", async () => {
    const ctx = makeCtx({ correct: false, proposedValue: "", expectedSolutions: [] });
    const result = await grader.grade({ item: makeItem(), response: null, ctx });
    expect(result.score).toBe(0);
  });

  it("returns needs-human-review when expectedSolution not set", async () => {
    const ctx = makeCtx({ correct: false, proposedValue: "", expectedSolutions: [] });
    const item: AssignmentItem = { id: "item-1", kind: "math", prompt: "2x=4" };
    const result = await grader.grade({ item, response: makeResponse("3"), ctx });
    expect(result.score).toBeNull();
    expect(result.tier).toBe("needs-human-review");
  });
});
