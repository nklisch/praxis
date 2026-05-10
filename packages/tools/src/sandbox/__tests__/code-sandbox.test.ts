import type { CodeSandbox, ToolContext } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { codeSandboxInput, codeSandboxTool } from "../code-sandbox.js";

function makeEmptyPedagogyPackService() {
  return { current: () => null, listStrategies: () => [], getStrategy: () => null, listTechniques: () => [], getTechnique: () => null, listMetacognitivePrompts: () => [] };
}

const mockSandbox: CodeSandbox = {
  availableLanguages: ["javascript", "python"],
  run: vi.fn().mockResolvedValue({
    stdout: "4\n",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    durationMs: 5,
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
    sympy: {
      checkSolution: vi.fn(),
      solveEquation: vi.fn(),
      simplify: vi.fn(),
      checkEquivalent: vi.fn(),
      parseLatex: vi.fn(),
    },
    sandbox: mockSandbox,
    pedagogyPack: makeEmptyPedagogyPackService(),
    lock: null as any,
    authoring: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
    notes: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
    flashcards: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
    fsrsScheduler: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder — not used in this test
    packs: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 8 placeholder — not used in this test
    assignments: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 16 placeholder — not used in this test
    courseDocuments: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 16 placeholder — not used in this test
    engineResolver: null as any,
  },
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    child: vi.fn().mockReturnValue(undefined as any),
  },
};

describe("codeSandboxTool", () => {
  it("has correct name", () => {
    expect(codeSandboxTool.name).toBe("code_sandbox");
  });

  it("has tier: deterministic", () => {
    expect(codeSandboxTool.tier).toBe("deterministic");
  });

  it("has effects: external.code-exec", () => {
    expect(codeSandboxTool.effects).toContain("external.code-exec");
  });
});

describe("codeSandboxTool handler", () => {
  it("calls sandbox.run with language and code", async () => {
    vi.mocked(mockSandbox.run).mockResolvedValueOnce({
      stdout: "4\n",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      durationMs: 5,
    });

    const result = await codeSandboxTool.handler(
      { language: "javascript", code: "console.log(2+2)" },
      mockCtx,
    );

    expect(mockSandbox.run).toHaveBeenCalledWith({
      language: "javascript",
      code: "console.log(2+2)",
    });
    expect(result.stdout).toBe("4\n");
    expect(result.exitCode).toBe(0);
  });

  it("passes optional stdin only when defined", async () => {
    vi.mocked(mockSandbox.run).mockResolvedValueOnce({
      stdout: "hi\n",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      durationMs: 5,
    });

    await codeSandboxTool.handler(
      { language: "python", code: "import sys; print(sys.stdin.read())", stdin: "hi" },
      mockCtx,
    );

    expect(mockSandbox.run).toHaveBeenCalledWith(expect.objectContaining({ stdin: "hi" }));
  });

  it("does NOT include stdin when not provided", async () => {
    vi.mocked(mockSandbox.run).mockResolvedValueOnce({
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      durationMs: 5,
    });

    await codeSandboxTool.handler({ language: "javascript", code: "1+1" }, mockCtx);

    const callArg = vi.mocked(mockSandbox.run).mock.calls.at(-1)?.[0];
    expect(callArg).not.toHaveProperty("stdin");
  });

  it("passes timeoutMs only when defined", async () => {
    vi.mocked(mockSandbox.run).mockResolvedValueOnce({
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      durationMs: 5,
    });

    await codeSandboxTool.handler(
      { language: "javascript", code: "1+1", timeoutMs: 10_000 },
      mockCtx,
    );

    expect(mockSandbox.run).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 10_000 }));
  });

  it("passes result through unchanged", async () => {
    const expectedResult = {
      stdout: "hello\n",
      stderr: "warn\n",
      exitCode: 1,
      timedOut: false,
      durationMs: 100,
      truncated: { stdout: false, stderr: false },
    };
    vi.mocked(mockSandbox.run).mockResolvedValueOnce(expectedResult);

    const result = await codeSandboxTool.handler(
      { language: "python", code: "print('hello')" },
      mockCtx,
    );

    expect(result).toEqual(expectedResult);
  });
});

describe("codeSandboxInput Zod validation", () => {
  it("rejects unsupported language", () => {
    const parse = codeSandboxInput.safeParse({
      language: "ruby",
      code: "puts 'hello'",
    });
    expect(parse.success).toBe(false);
  });

  it("rejects timeoutMs > 30_000", () => {
    const parse = codeSandboxInput.safeParse({
      language: "javascript",
      code: "1+1",
      timeoutMs: 60_000,
    });
    expect(parse.success).toBe(false);
  });

  it("accepts valid javascript input", () => {
    const parse = codeSandboxInput.safeParse({
      language: "javascript",
      code: "console.log(1)",
    });
    expect(parse.success).toBe(true);
  });

  it("accepts valid python input with all optional fields", () => {
    const parse = codeSandboxInput.safeParse({
      language: "python",
      code: "print('hello')",
      stdin: "input data",
      timeoutMs: 10_000,
    });
    expect(parse.success).toBe(true);
  });
});
