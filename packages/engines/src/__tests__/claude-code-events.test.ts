import { describe, expect, it, vi } from "vitest";
import { createClaudeCodeMapperState, mapClaudeCodeEvent } from "../claude-code/events.js";

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

  it("surfaces an error event when the request was actually rate-limited (five-hour window, no overage)", () => {
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
        // Message includes rate-limit type + ISO reset timestamp so the user
        // can read it without decoding raw epoch seconds.
        message: "Rate limited (five_hour window); resets at 2026-05-03T06:40:00.000Z",
        recoverable: true,
        details: {
          kind: "rate_limit",
          rateLimitType: "five_hour",
          resetsAt: 1_777_790_400,
          isUsingOverage: false,
        },
      },
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("formats seven_day window with overage-billing note when isUsingOverage is true", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "rate_limit_event",
        rateLimitInfo: {
          status: "rate_limited",
          resetsAt: 1_778_842_800,
          rateLimitType: "seven_day",
          isUsingOverage: true,
        },
      },
      { serverName: "praxis" },
    );

    expect(result).toEqual({
      type: "error",
      error: {
        code: "engine.rate_limited",
        message:
          "Rate limited (seven_day window, overage billing active); resets at 2026-05-15T11:00:00.000Z",
        recoverable: true,
        details: {
          kind: "rate_limit",
          rateLimitType: "seven_day",
          resetsAt: 1_778_842_800,
          isUsingOverage: true,
        },
      },
    });
  });

  it("drops rate_limit_event with unknown status (forward-compat with future SDK additions)", () => {
    const log = { warn: vi.fn() };
    const result = mapClaudeCodeEvent(
      {
        type: "rate_limit_event",
        rateLimitInfo: {
          status: "warned",
          resetsAt: 1_777_790_400,
          rateLimitType: "monthly",
          isUsingOverage: false,
        },
      },
      { serverName: "praxis", log },
    );
    expect(result).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      "engine.claude-code.rate_limit_unknown_status",
      expect.any(Object),
    );
  });

  it("populates optional overage fields on details when overageStatus and overageResetsAt are present", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "rate_limit_event",
        rateLimitInfo: {
          status: "rate_limited",
          resetsAt: 1_778_842_800,
          rateLimitType: "five_hour",
          isUsingOverage: true,
          overageStatus: "active",
          overageResetsAt: 1_778_929_200,
        },
      },
      { serverName: "praxis" },
    );

    expect(result?.type).toBe("error");
    if (result?.type === "error") {
      expect(result.error.details).toEqual({
        kind: "rate_limit",
        rateLimitType: "five_hour",
        resetsAt: 1_778_842_800,
        isUsingOverage: true,
        overageStatus: "active",
        overageResetsAt: 1_778_929_200,
      });
    }
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

/**
 * Cross-channel ID agreement: the engine's tool_call.callId MUST equal the
 * ctx.callId the tool handler receives via the bridge for the same invocation.
 *
 * The Claude Code adapter uses a per-session state to translate Claude UUIDs
 * to sequential callCounters that mirror the bridge worker's counter. Both
 * sides therefore agree on the same callId string.
 *
 * This test verifies the adapter-side translation produces sequential ids that
 * match the bridge counter sequence ("1", "2", "3", …), and that the
 * tool_result side resolves back to the same translated id.
 *
 * Context: the bridge worker (`@praxis/claude-cli-sdk/src/tool-server.ts`) uses
 * its own callCounter for socket IPC. The Claude Code adapter previously used
 * `event.toolId` (a Claude UUID like "toolu_01ABC…") which never matched.
 * This fix maintains an adapter-side orderCounter that mirrors the bridge counter.
 */
describe("mapClaudeCodeEvent — cross-channel callId agreement", () => {
  it("tool_use events with state produce sequential callIds matching bridge counter", () => {
    const state = createClaudeCodeMapperState();
    const ctx = { serverName: "praxis" };

    const event1 = mapClaudeCodeEvent(
      {
        type: "tool_use",
        toolName: "praxis__document.outline",
        toolId: "toolu_01ABC",
        toolInput: {},
      },
      ctx,
      state,
    );
    const event2 = mapClaudeCodeEvent(
      {
        type: "tool_use",
        toolName: "praxis__document.read_pages",
        toolId: "toolu_02DEF",
        toolInput: {},
      },
      ctx,
      state,
    );
    const event3 = mapClaudeCodeEvent(
      {
        type: "tool_use",
        toolName: "praxis__course.start_drafting",
        toolId: "toolu_03GHI",
        toolInput: {},
      },
      ctx,
      state,
    );

    expect(event1?.type === "tool_call" && event1.callId).toBe("1");
    expect(event2?.type === "tool_call" && event2.callId).toBe("2");
    expect(event3?.type === "tool_call" && event3.callId).toBe("3");
  });

  it("tool_result with state resolves to the same callId as the corresponding tool_use", () => {
    const state = createClaudeCodeMapperState();
    const ctx = { serverName: "praxis" };

    // Simulate a tool_use that gets callId "1".
    mapClaudeCodeEvent(
      {
        type: "tool_use",
        toolName: "praxis__course.start_drafting",
        toolId: "toolu_01ABC",
        toolInput: {},
      },
      ctx,
      state,
    );

    // The matching tool_result should resolve to "1", not "toolu_01ABC".
    const result = mapClaudeCodeEvent(
      { type: "tool_result", toolId: "toolu_01ABC", value: { ok: true }, isError: false },
      ctx,
      state,
    );

    expect(result?.type).toBe("tool_result");
    if (result?.type === "tool_result") {
      expect(result.callId).toBe("1");
      // Regression guard: must NOT be the raw Claude UUID.
      expect(result.callId).not.toMatch(/^toolu_/);
    }
  });

  it("sequential tool_use/tool_result pairs maintain independent translation", () => {
    const state = createClaudeCodeMapperState();
    const ctx = { serverName: "praxis" };

    // Two tool_use events.
    const tc1 = mapClaudeCodeEvent(
      {
        type: "tool_use",
        toolName: "praxis__document.outline",
        toolId: "toolu_AAA",
        toolInput: {},
      },
      ctx,
      state,
    );
    const tc2 = mapClaudeCodeEvent(
      {
        type: "tool_use",
        toolName: "praxis__document.read_pages",
        toolId: "toolu_BBB",
        toolInput: {},
      },
      ctx,
      state,
    );

    // Results arrive (possibly out of Claude's internal order, but still matched by toolId).
    const tr2 = mapClaudeCodeEvent(
      { type: "tool_result", toolId: "toolu_BBB", value: "pages content", isError: false },
      ctx,
      state,
    );
    const tr1 = mapClaudeCodeEvent(
      { type: "tool_result", toolId: "toolu_AAA", value: "outline content", isError: false },
      ctx,
      state,
    );

    expect(tc1?.type === "tool_call" && tc1.callId).toBe("1");
    expect(tc2?.type === "tool_call" && tc2.callId).toBe("2");
    // Results resolve back to their assigned sequential ids.
    expect(tr2?.type === "tool_result" && tr2.callId).toBe("2");
    expect(tr1?.type === "tool_result" && tr1.callId).toBe("1");
  });

  it("without state, tool_use falls back to raw Claude UUID (backward-compat for tests)", () => {
    const result = mapClaudeCodeEvent(
      {
        type: "tool_use",
        toolName: "praxis__course.start_drafting",
        toolId: "toolu_01ABC",
        toolInput: {},
      },
      { serverName: "praxis" },
      // no state
    );
    expect(result?.type === "tool_call" && result.callId).toBe("toolu_01ABC");
  });
});
