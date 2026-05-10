/**
 * Tests for the clarification tool (Phase 16 — exam mode only).
 *
 * The tool is intentionally a passthrough: it echoes the student's question
 * back so the surrounding model turn can compose the plain-language rephrasing.
 * Tests verify the shape, tier, effects, and handler contract.
 */

import { describe, expect, it } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { clarificationTool } from "../clarification.js";
import { EXAM_TOOLS } from "../index.js";

describe("clarificationTool — shape", () => {
  it("has name 'clarification'", () => {
    expect(clarificationTool.name).toBe("clarification");
  });

  it("has tier 'deterministic'", () => {
    expect(clarificationTool.tier).toBe("deterministic");
  });

  it("has effects ['none']", () => {
    expect(clarificationTool.effects).toEqual(["none"]);
  });

  it("input schema accepts studentQuestion + optional itemId", () => {
    const ok = clarificationTool.input.safeParse({
      studentQuestion: "What does this question mean?",
      itemId: "item-3",
    });
    expect(ok.success).toBe(true);
  });

  it("input schema rejects empty studentQuestion", () => {
    const result = clarificationTool.input.safeParse({ studentQuestion: "" });
    expect(result.success).toBe(false);
  });

  it("input schema accepts studentQuestion without itemId", () => {
    const result = clarificationTool.input.safeParse({
      studentQuestion: "What does item 2 mean?",
    });
    expect(result.success).toBe(true);
  });

  it("output schema validates { kind: 'rephrased', text: string }", () => {
    const result = clarificationTool.output.safeParse({
      kind: "rephrased",
      text: "Some question",
    });
    expect(result.success).toBe(true);
  });
});

describe("clarificationTool — handler", () => {
  const ctx = makeToolContext();

  it("returns kind='rephrased' with the student question as text", async () => {
    const result = await clarificationTool.handler(
      { studentQuestion: "What does 'evaluate' mean here?" },
      ctx,
    );
    expect(result.kind).toBe("rephrased");
    expect(result.text).toBe("What does 'evaluate' mean here?");
    expect(result.itemId).toBeUndefined();
  });

  it("passes itemId through when provided", async () => {
    const result = await clarificationTool.handler(
      { studentQuestion: "Rephrase item 2 please.", itemId: "item-2" },
      ctx,
    );
    expect(result.kind).toBe("rephrased");
    expect(result.itemId).toBe("item-2");
  });

  it("does not include itemId in output when not provided", async () => {
    const result = await clarificationTool.handler({ studentQuestion: "Unclear question." }, ctx);
    expect("itemId" in result).toBe(false);
  });
});

describe("EXAM_TOOLS", () => {
  it("includes the clarification tool", () => {
    expect(EXAM_TOOLS.some((t) => t.name === "clarification")).toBe(true);
  });

  it("is an array with exactly one tool", () => {
    expect(EXAM_TOOLS).toHaveLength(1);
  });
});
