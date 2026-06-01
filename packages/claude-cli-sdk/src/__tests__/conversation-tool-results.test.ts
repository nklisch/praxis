import { describe, expect, it } from "vitest";
import {
  _prepareToolResultContentForTest,
  _toolResultContentFromHandlerResultForTest,
} from "../conversation.js";

describe("conversation tool result content", () => {
  it("serializes non-JSON tool result values into valid JSON content", () => {
    const cycle: Record<string, unknown> = { name: "root" };
    cycle.self = cycle;

    const prepared = _prepareToolResultContentForTest({
      toolUseId: "tool-1",
      value: {
        missing: undefined,
        big: 42n,
        fn: function namedToolValue() {},
        sym: Symbol("tool"),
        cycle,
      },
    });

    expect(prepared.isError).toBe(false);
    expect(JSON.parse(prepared.content)).toEqual({
      missing: null,
      big: "42",
      fn: "[Function: namedToolValue]",
      sym: "Symbol(tool)",
      cycle: { name: "root", self: "[Circular]" },
    });
  });

  it("turns serialization failures into tool errors", () => {
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "throws", {
      enumerable: true,
      get() {
        throw new Error("getter exploded");
      },
    });

    const prepared = _prepareToolResultContentForTest({ toolUseId: "tool-1", value: hostile });

    expect(prepared.isError).toBe(true);
    expect(JSON.parse(prepared.content)).toContain("Tool result could not be serialized");
    expect(JSON.parse(prepared.content)).toContain("getter exploded");
  });

  it("preserves bare handler payloads that include a value field with siblings", () => {
    const result = _toolResultContentFromHandlerResultForTest({ value: 42, unit: "kg" }, "tool-1");

    expect(result).toEqual({ toolUseId: "tool-1", value: { value: 42, unit: "kg" } });
  });

  it("still supports the explicit { value, isError } handler envelope", () => {
    const result = _toolResultContentFromHandlerResultForTest(
      { value: "expected failure", isError: true },
      "tool-1",
    );

    expect(result).toEqual({ toolUseId: "tool-1", value: "expected failure", isError: true });
  });
});
