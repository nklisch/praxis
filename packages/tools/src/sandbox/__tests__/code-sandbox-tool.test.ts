import type { CodeSandbox } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { createCodeSandboxTool } from "../code-sandbox.js";

function makeSandbox(languages: string[]): CodeSandbox {
  return {
    availableLanguages: languages,
    run: async () => ({
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      durationMs: 5,
    }),
  };
}

describe("createCodeSandboxTool", () => {
  it("throws when sandbox has no language adapters", () => {
    expect(() => createCodeSandboxTool(makeSandbox([]))).toThrow(
      /sandbox has no language adapters registered/,
    );
  });

  it("returns a tool with name 'code_sandbox'", () => {
    const tool = createCodeSandboxTool(makeSandbox(["javascript"]));
    expect(tool.name).toBe("code_sandbox");
  });

  it("one adapter: input schema accepts that language", () => {
    const tool = createCodeSandboxTool(makeSandbox(["javascript"]));
    const r = tool.input.safeParse({ language: "javascript", code: "1+1" });
    expect(r.success).toBe(true);
  });

  it("one adapter: input schema rejects other languages", () => {
    const tool = createCodeSandboxTool(makeSandbox(["javascript"]));
    const r = tool.input.safeParse({ language: "python", code: "print(1)" });
    expect(r.success).toBe(false);
  });

  it("two adapters: enum advertises both languages", () => {
    const tool = createCodeSandboxTool(makeSandbox(["javascript", "python"]));
    const jsOk = tool.input.safeParse({ language: "javascript", code: "1" });
    const pyOk = tool.input.safeParse({ language: "python", code: "print(1)" });
    expect(jsOk.success).toBe(true);
    expect(pyOk.success).toBe(true);
  });

  it("two adapters: rejects unlisted language", () => {
    const tool = createCodeSandboxTool(makeSandbox(["javascript", "python"]));
    const r = tool.input.safeParse({ language: "ruby", code: "puts 1" });
    expect(r.success).toBe(false);
  });

  it("description includes the language list", () => {
    const tool = createCodeSandboxTool(makeSandbox(["javascript", "python"]));
    expect(tool.description).toContain("javascript");
    expect(tool.description).toContain("python");
  });

  it("tool has tier: deterministic", () => {
    const tool = createCodeSandboxTool(makeSandbox(["javascript"]));
    expect(tool.tier).toBe("deterministic");
  });

  it("tool has effect: external.code-exec", () => {
    const tool = createCodeSandboxTool(makeSandbox(["javascript"]));
    expect(tool.effects).toContain("external.code-exec");
  });
});
