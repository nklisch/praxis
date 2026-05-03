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
          rateLimitInfo: { status: "allowed", resetsAt: 0, rateLimitType: "five_hour" },
        },
        { serverName: "praxis" },
      ),
    ).not.toThrow();
  });
});
