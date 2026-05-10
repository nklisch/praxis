/**
 * Tests for the CLI stream-json parser, focused on tool_result MCP content
 * extraction + JSON parsing.
 *
 * The CLI's MCP tool server wraps tool results as
 *   { content: [{ type: "text", text: "<payload>" }] }
 * The parser is responsible for both:
 *   1. Flattening MCP content blocks into plain text.
 *   2. JSON-parsing the resulting text so consumers see the tool handler's
 *      actual return value (object/array/primitive) directly via `value`.
 *
 * Downstream consumers (engine adapters) should never have to detect MCP
 * shape OR call JSON.parse themselves.
 */
import { describe, expect, it } from "vitest";
import { parseStreamLine } from "../cli/parser.js";

function userToolResultLine(toolUseId: string, content: unknown, isError = false): string {
  return JSON.stringify({
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content,
          is_error: isError,
        },
      ],
    },
  });
}

describe("parseStreamLine — tool_result content extraction + JSON parse", () => {
  it("extracts text from MCP blocks and parses JSON into a structured value", () => {
    const inner = JSON.stringify({ draftId: "draft-uuid-1", note: "ok" });
    const line = userToolResultLine("call-1", [{ type: "text", text: inner }]);

    const event = parseStreamLine(line);

    expect(event?.type).toBe("tool_result");
    if (event?.type === "tool_result") {
      // value is the parsed object, not a string, not an MCP array.
      expect(event.value).toEqual({ draftId: "draft-uuid-1", note: "ok" });
      expect(event.toolId).toBe("call-1");
      expect(event.isError).toBe(false);
    }
  });

  it("concatenates text from multiple text blocks before parsing", () => {
    const line = userToolResultLine("call-2", [
      { type: "text", text: '{"a":1' },
      { type: "text", text: ',"b":2}' },
    ]);

    const event = parseStreamLine(line);

    if (event?.type === "tool_result") {
      expect(event.value).toEqual({ a: 1, b: 2 });
    }
  });

  it("falls back to the raw string when text content isn't valid JSON", () => {
    const line = userToolResultLine("call-3", [
      { type: "text", text: "plain markdown reply, not JSON" },
    ]);

    const event = parseStreamLine(line);

    if (event?.type === "tool_result") {
      expect(event.value).toBe("plain markdown reply, not JSON");
    }
  });

  it("passes a bare string content through (older MCP impls) and parses if JSON", () => {
    const line = userToolResultLine("call-4", '{"x":42}');

    const event = parseStreamLine(line);

    if (event?.type === "tool_result") {
      expect(event.value).toEqual({ x: 42 });
    }
  });

  it("preserves non-text MCP blocks as type placeholders (raw string fallback)", () => {
    const line = userToolResultLine("call-5", [
      { type: "text", text: "before" },
      { type: "image", data: "ignored", mimeType: "image/png" },
      { type: "text", text: "after" },
    ]);

    const event = parseStreamLine(line);

    if (event?.type === "tool_result") {
      // "before[image]after" isn't valid JSON, so value falls back to the string.
      expect(event.value).toBe("before[image]after");
    }
  });

  it("propagates is_error correctly", () => {
    const line = userToolResultLine("call-6", [{ type: "text", text: "tool exploded" }], true);

    const event = parseStreamLine(line);

    if (event?.type === "tool_result") {
      expect(event.value).toBe("tool exploded");
      expect(event.isError).toBe(true);
    }
  });

  it("returns undefined value when the MCP message has no content field", () => {
    const line = JSON.stringify({
      type: "user",
      message: {
        content: [
          { type: "tool_result", tool_use_id: "call-7" }, // no content / is_error
        ],
      },
    });

    const event = parseStreamLine(line);

    if (event?.type === "tool_result") {
      expect(event.value).toBeUndefined();
    }
  });

  it("returns null for a user message with no tool_result block", () => {
    const line = JSON.stringify({
      type: "user",
      message: { content: [{ type: "text", text: "just a chat reply" }] },
    });

    expect(parseStreamLine(line)).toBeNull();
  });

  it("silently ignores non-init system event subtypes (e.g. compact_boundary)", () => {
    // The CLI emits many internal system subtypes (compact_boundary,
    // mcp_status, notification, ...) that are not part of our public event
    // surface. They must NOT produce a warn-level log or a parse error —
    // just drop them.
    const compactBoundary = JSON.stringify({
      type: "system",
      subtype: "compact_boundary",
      session_id: "sess-1",
      compact_metadata: { trigger: "auto" },
    });
    expect(parseStreamLine(compactBoundary)).toBeNull();

    const taskProgress = JSON.stringify({
      type: "system",
      subtype: "task_progress",
      session_id: "sess-1",
      data: { progress: 0.5 },
    });
    expect(parseStreamLine(taskProgress)).toBeNull();
  });

  it("still parses a well-formed system init event", () => {
    const initLine = JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "sess-init-1",
      model: "claude-sonnet-4-6-20250514",
      tools: ["Read", "Bash"],
      cwd: "/tmp/work",
    });

    const event = parseStreamLine(initLine);
    expect(event?.type).toBe("system");
    if (event?.type === "system") {
      expect(event.subtype).toBe("init");
      expect(event.sessionId).toBe("sess-init-1");
      expect(event.tools).toEqual(["Read", "Bash"]);
    }
  });

  it("tolerates malformed MCP content gracefully (value -> undefined, no throw)", () => {
    const line = JSON.stringify({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "call-8",
            content: { someField: "value" }, // not string, not array — malformed
          },
        ],
      },
    });

    const event = parseStreamLine(line);

    expect(event?.type).toBe("tool_result");
    if (event?.type === "tool_result") {
      expect(event.value).toBeUndefined();
      expect(event.toolId).toBe("call-8");
    }
  });

  it("preserves a JSON-stringified primitive (number, bool, null)", () => {
    const lineNum = userToolResultLine("call-9a", [{ type: "text", text: "42" }]);
    expect(
      parseStreamLine(lineNum)?.type === "tool_result" && parseStreamLine(lineNum),
    ).toMatchObject({
      type: "tool_result",
      value: 42,
    });

    const lineBool = userToolResultLine("call-9b", [{ type: "text", text: "true" }]);
    const evtBool = parseStreamLine(lineBool);
    if (evtBool?.type === "tool_result") expect(evtBool.value).toBe(true);

    const lineNull = userToolResultLine("call-9c", [{ type: "text", text: "null" }]);
    const evtNull = parseStreamLine(lineNull);
    if (evtNull?.type === "tool_result") expect(evtNull.value).toBeNull();
  });
});
