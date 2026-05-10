import { describe, expect, it, vi } from "vitest";
import { mapClaudeCodeEvent } from "../claude-code/events.js";

describe("mapClaudeCodeEvent — rate_limit_event", () => {
  it("drops informational events (status=allowed) and logs a warning instead of erroring the stream", () => {
    const log = { warn: vi.fn() };
    const result = mapClaudeCodeEvent(
      {
        type: "rate_limit_event",
        rateLimitInfo: {
          status: "allowed",
          resetsAt: 1_777_790_400,
          rateLimitType: "five_hour",
          isUsingOverage: false,
        },
      },
      { serverName: "praxis", log },
    );

    expect(result).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      "engine.claude-code.rate_limit_info",
      expect.objectContaining({ status: "allowed", rateLimitType: "five_hour" }),
    );
  });

  it("surfaces an error event when the request was actually rate-limited", () => {
    const log = { warn: vi.fn() };
    const result = mapClaudeCodeEvent(
      {
        type: "rate_limit_event",
        rateLimitInfo: {
          status: "rate_limited",
          resetsAt: 1_777_790_400,
          rateLimitType: "five_hour",
          isUsingOverage: false,
        },
      },
      { serverName: "praxis", log },
    );

    expect(result).toEqual({
      type: "error",
      error: {
        code: "engine.rate_limited",
        message: "Rate limited; resets at 1777790400",
        recoverable: true,
      },
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("does not throw when no logger is provided (back-compat)", () => {
    expect(() =>
      mapClaudeCodeEvent(
        {
          type: "rate_limit_event",
          rateLimitInfo: {
            status: "allowed",
            resetsAt: 0,
            rateLimitType: "five_hour",
            isUsingOverage: false,
          },
        },
        { serverName: "praxis" },
      ),
    ).not.toThrow();
  });
});

describe("mapClaudeCodeEvent — result.subtype mapping", () => {
  const baseUsage = { inputTokens: 100, outputTokens: 50 };
  const baseSession = "test-session-id";

  it("subtype 'success' maps to finalReason 'success' with no errorMessage", () => {
    const result = mapClaudeCodeEvent(
      { type: "result", subtype: "success", sessionId: baseSession, usage: baseUsage },
      { serverName: "praxis" },
    );
    expect(result?.type).toBe("final");
    if (result?.type === "final") {
      expect(result.finalReason).toBe("success");
      expect(result.errorMessage).toBeUndefined();
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(50);
    }
  });

  it("subtype 'error_max_turns' maps to finalReason 'max_turns' and forwards the error message", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "result",
        subtype: "error_max_turns",
        sessionId: baseSession,
        usage: baseUsage,
        error: "Hit max turns",
      },
      { serverName: "praxis" },
    );
    expect(result?.type).toBe("final");
    if (result?.type === "final") {
      expect(result.finalReason).toBe("max_turns");
      expect(result.errorMessage).toBe("Hit max turns");
    }
  });

  it("subtype 'error_during_generation' maps to 'generation_error'", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "result",
        subtype: "error_during_generation",
        sessionId: baseSession,
        usage: baseUsage,
        error: "model error",
      },
      { serverName: "praxis" },
    );
    if (result?.type === "final") {
      expect(result.finalReason).toBe("generation_error");
      expect(result.errorMessage).toBe("model error");
    }
  });

  it("subtype 'error_interrupted' maps to 'interrupted'", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "result",
        subtype: "error_interrupted",
        sessionId: baseSession,
        usage: baseUsage,
        error: "aborted",
      },
      { serverName: "praxis" },
    );
    if (result?.type === "final") {
      expect(result.finalReason).toBe("interrupted");
      expect(result.errorMessage).toBe("aborted");
    }
  });

  it("does not include errorMessage when subtype is success even if error field is present", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "result",
        subtype: "success",
        sessionId: baseSession,
        usage: baseUsage,
        error: "spurious",
      },
      { serverName: "praxis" },
    );
    if (result?.type === "final") {
      expect(result.errorMessage).toBeUndefined();
    }
  });
});

describe("mapClaudeCodeEvent — tool_result", () => {
  // MCP content-block extraction AND JSON parsing both happen in the SDK
  // parser (see packages/claude-cli-sdk/src/__tests__/parser.test.ts). By the
  // time this adapter runs, `e.value` is already the tool handler's actual
  // return value. All the adapter does is wrap it in the engine ToolResult
  // shape with success/error semantics.

  it("passes a structured success value through verbatim", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "tool_result",
        toolId: "call-1",
        value: { draftId: "draft-uuid-1", note: "ok" },
        isError: false,
      },
      { serverName: "praxis" },
    );
    if (result?.type === "tool_result" && result.result.ok) {
      expect(result.result.value).toEqual({ draftId: "draft-uuid-1", note: "ok" });
    } else {
      throw new Error("expected ok tool_result");
    }
  });

  it("preserves a string value (e.g. tools that return plain text)", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "tool_result",
        toolId: "call-2",
        value: "plain text result",
        isError: false,
      },
      { serverName: "praxis" },
    );
    if (result?.type === "tool_result" && result.result.ok) {
      expect(result.result.value).toBe("plain text result");
    } else {
      throw new Error("expected ok tool_result");
    }
  });

  it("surfaces a string value as the error message on isError:true", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "tool_result",
        toolId: "call-3",
        value: "tool exploded: missing draftId",
        isError: true,
      },
      { serverName: "praxis" },
    );
    if (result?.type === "tool_result" && !result.result.ok) {
      expect(result.result.error.message).toBe("tool exploded: missing draftId");
    } else {
      throw new Error("expected error tool_result");
    }
  });

  it("stringifies a non-string error value when isError:true", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "tool_result",
        toolId: "call-4",
        value: { code: "EBOOM", detail: "kaboom" },
        isError: true,
      },
      { serverName: "praxis" },
    );
    if (result?.type === "tool_result" && !result.result.ok) {
      expect(result.result.error.message).toBe('{"code":"EBOOM","detail":"kaboom"}');
    } else {
      throw new Error("expected error tool_result");
    }
  });
});
