import type { ToolContext } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InProcessToolRegistry } from "../registry.js";
import { echoTool, nowTool } from "../test-tools/index.js";

const ctx: ToolContext = {
  studentId: brandId<"StudentId">("student-1"),
  sessionId: brandId<"SessionId">("session-1"),
  services: {
    memory: null,
    artifacts: null,
    vectorStore: null,
    sandbox: null,
    sympy: null,
    pedagogyPack: null,
  },
  log: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
};

describe("InProcessToolRegistry", () => {
  it("constructs with echo and now tools", () => {
    const registry = new InProcessToolRegistry({ tools: [echoTool, nowTool], context: ctx });
    expect(registry.list()).toHaveLength(2);
  });

  it("list() returns summaries with inputSchemaJson and inputSchemaNative", () => {
    const registry = new InProcessToolRegistry({ tools: [echoTool, nowTool], context: ctx });
    const summaries = registry.list();
    for (const s of summaries) {
      expect(s.inputSchemaJson).toBeDefined();
      expect(s.inputSchemaNative).toBeInstanceOf(z.ZodType);
    }
  });

  it("dispatch echo returns echoed value", async () => {
    const registry = new InProcessToolRegistry({ tools: [echoTool], context: ctx });
    const result = await registry.dispatch("test.echo", { text: "hi" });
    expect(result).toEqual({ ok: true, value: { echoed: "hi" }, tier: "deterministic" });
  });

  it("dispatch echo with wrong args returns tool.invalid_args", async () => {
    const registry = new InProcessToolRegistry({ tools: [echoTool], context: ctx });
    const result = await registry.dispatch("test.echo", { wrong: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("tool.invalid_args");
      expect(result.error.recoverable).toBe(true);
    }
  });

  it("dispatch unknown tool returns tool.not_found", async () => {
    const registry = new InProcessToolRegistry({ tools: [echoTool], context: ctx });
    const result = await registry.dispatch("missing", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("tool.not_found");
    }
  });

  it("throws synchronously on duplicate tool names", () => {
    expect(() => {
      new InProcessToolRegistry({ tools: [echoTool, echoTool], context: ctx });
    }).toThrow(`Tool "test.echo" registered twice`);
  });
});
