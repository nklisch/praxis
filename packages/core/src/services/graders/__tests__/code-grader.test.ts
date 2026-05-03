import { describe, expect, it, vi } from "vitest";
import type { AssignmentResponse, CodeItem } from "../../../types/artifacts.js";
import type { CodeSandboxResult } from "../../../types/tool.js";
import { CodeGrader } from "../code-grader.js";
import type { GraderContext, GraderServices } from "../types.js";

function makeItem(overrides: Partial<CodeItem> = {}): CodeItem {
  return {
    id: "item-1",
    kind: "code",
    prompt: "Write a function that adds two numbers",
    language: "javascript",
    testCases: [
      { stdin: "1 2", expectedStdout: "3" },
      { stdin: "5 5", expectedStdout: "10" },
    ],
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

function makeCtx(sandboxResults: CodeSandboxResult[]): GraderContext {
  let callCount = 0;
  return {
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(), // biome-ignore lint/suspicious/noExplicitAny: test mock
      child: vi.fn().mockReturnValue(undefined as any),
    },
    services: {
      sympy: {} as GraderServices["sympy"],
      sandbox: {
        run: vi.fn().mockImplementation(() => {
          const result = sandboxResults[callCount] ?? sandboxResults[sandboxResults.length - 1];
          callCount++;
          return Promise.resolve(result);
        }),
      } as unknown as GraderServices["sandbox"],
      engineResolver: vi.fn(),
    },
    mode: "quiz",
  };
}

function passingResult(stdout: string): CodeSandboxResult {
  return { stdout, stderr: "", exitCode: 0, timedOut: false, durationMs: 5 };
}

function failingResult(): CodeSandboxResult {
  return { stdout: "wrong", stderr: "", exitCode: 0, timedOut: false, durationMs: 5 };
}

describe("CodeGrader", () => {
  const grader = new CodeGrader();

  it("returns score=1 when all test cases pass", async () => {
    const ctx = makeCtx([passingResult("3"), passingResult("10")]);
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse("function add(a, b) { return a + b; }"),
      ctx,
    });
    expect(result.score).toBe(1);
    expect(result.tier).toBe("deterministic");
    expect(result.feedback).toContain("All 2");
  });

  it("returns partial score when some test cases fail", async () => {
    const ctx = makeCtx([passingResult("3"), failingResult()]);
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse("bad code"),
      ctx,
    });
    expect(result.score).toBe(0.5);
    expect(result.tier).toBe("deterministic");
    expect(result.feedback).toContain("1/2");
  });

  it("returns score=0 when all test cases fail", async () => {
    const ctx = makeCtx([failingResult(), failingResult()]);
    const result = await grader.grade({ item: makeItem(), response: makeResponse("wrong"), ctx });
    expect(result.score).toBe(0);
  });

  it("returns score=0 for empty code", async () => {
    const ctx = makeCtx([]);
    const result = await grader.grade({ item: makeItem(), response: makeResponse(""), ctx });
    expect(result.score).toBe(0);
    expect(result.feedback).toContain("No code");
  });

  it("returns score=0 for null response", async () => {
    const ctx = makeCtx([]);
    const result = await grader.grade({ item: makeItem(), response: null, ctx });
    expect(result.score).toBe(0);
  });

  it("returns needs-human-review when no testCases", async () => {
    const ctx = makeCtx([]);
    const item = makeItem({ testCases: [] });
    const result = await grader.grade({ item, response: makeResponse("code"), ctx });
    expect(result.score).toBeNull();
    expect(result.tier).toBe("needs-human-review");
  });

  // NOTE: language is now a required field on CodeItem (discriminated union enforces it),
  // so there is no code path that returns needs-human-review for a missing language.
  // This test case has been removed.

  it("handles timed-out test case", async () => {
    const timedOutResult: CodeSandboxResult = {
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: true,
      durationMs: 5000,
    };
    const ctx = makeCtx([timedOutResult, passingResult("10")]);
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse("slow code"),
      ctx,
    });
    expect(result.score).toBe(0.5);
    expect(result.feedback).toContain("timeout");
  });
});
