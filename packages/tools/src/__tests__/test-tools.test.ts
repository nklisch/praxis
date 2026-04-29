import type { ToolContext } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { echoTool, nowTool } from "../test-tools/index.js";

const ctx: ToolContext = {
  studentId: brandId<"StudentId">("student-1"),
  sessionId: brandId<"SessionId">("session-1"),
  services: {
    memory: null,
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
    sandbox: { run: vi.fn() },
    sympy: {
      checkSolution: vi.fn(),
      solveEquation: vi.fn(),
      simplify: vi.fn(),
      checkEquivalent: vi.fn(),
      parseLatex: vi.fn(),
    },
    pedagogyPack: null,
  },
  log: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
};

describe("echoTool", () => {
  it("echoes the input text", async () => {
    const result = await echoTool.handler({ text: "hello" }, ctx);
    expect(result).toEqual({ echoed: "hello" });
  });

  it("has deterministic tier", () => {
    expect(echoTool.tier).toBe("deterministic");
  });
});

describe("nowTool", () => {
  it("returns iso and epochMs", async () => {
    const before = Date.now();
    const result = await nowTool.handler({}, ctx);
    const after = Date.now();
    expect(result.epochMs).toBeGreaterThanOrEqual(before);
    expect(result.epochMs).toBeLessThanOrEqual(after);
    expect(new Date(result.iso).getTime()).toBe(result.epochMs);
  });

  it("has deterministic tier", () => {
    expect(nowTool.tier).toBe("deterministic");
  });
});
