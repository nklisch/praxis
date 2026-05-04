import type { ResultEvent, StreamEvent } from "@praxis/claude-cli-sdk";
import type { EngineEvent, ToolResult } from "@praxis/core/types";

/**
 * Strip the `mcp__<serverName>__` prefix that the Claude Code SDK applies to
 * MCP-served tools. Bare tool names match what consumers (and the conformance
 * suite) expect.
 */
export function stripMcpPrefix(toolName: string, serverName: string): string {
  const prefix = `mcp__${serverName}__`;
  return toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;
}

export interface MapStreamEventInput {
  serverName: string;
  /**
   * Optional logger. Used to surface informational rate-limit events as
   * warnings without erroring the stream. Back-compat: when omitted, those
   * events are silently dropped.
   */
  log?: { warn: (msg: string, fields?: Record<string, unknown>) => void };
}

/**
 * Map a Claude Code SDK StreamEvent to a Praxis EngineEvent. Returns null
 * for events with no useful projection (system.init, rate_limit_event we
 * choose to surface as warnings via the log instead).
 */
export function mapClaudeCodeEvent(
  event: StreamEvent,
  ctx: MapStreamEventInput,
): EngineEvent | null {
  switch (event.type) {
    case "system":
      return null; // init / metadata; not part of the normalized stream.
    case "assistant": {
      const delta = event.delta ?? "";
      // Prefer delta when present; fall back to full text.
      if (delta) return { type: "model_message", content: delta, partial: true };
      return { type: "model_message", content: event.text ?? "", partial: false };
    }
    case "tool_use":
      return {
        type: "tool_call",
        toolName: stripMcpPrefix(event.toolName, ctx.serverName),
        args: event.toolInput,
        callId: event.toolId,
      };
    case "tool_result": {
      // The SDK parser already (a) extracted MCP text blocks and (b)
      // JSON-parsed the result, so `event.value` is the tool handler's actual
      // return value — no string handling needed here. On error, `event.value`
      // is typically the error message string from the tool side.
      const isError = Boolean(event.isError);
      const result: ToolResult = isError
        ? {
            ok: false,
            error: {
              code: "tool.sdk_reported_error",
              message:
                typeof event.value === "string" ? event.value : JSON.stringify(event.value ?? null),
              recoverable: false,
            },
          }
        : { ok: true, value: event.value, tier: "deterministic" };
      return { type: "tool_result", callId: event.toolId ?? "", result };
    }
    case "result": {
      const usage = event.usage ?? { inputTokens: 0, outputTokens: 0 };
      const finalReason = mapResultSubtype(event.subtype);
      return {
        type: "final",
        usage: {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          ...(usage.cacheReadTokens !== undefined && { cacheReadTokens: usage.cacheReadTokens }),
          ...(usage.cacheWriteTokens !== undefined && {
            cacheWriteTokens: usage.cacheWriteTokens,
          }),
        },
        finalReason,
        ...(finalReason !== "success" &&
          event.error !== undefined && { errorMessage: event.error }),
      };
    }
    case "rate_limit_event": {
      const info = event.rateLimitInfo;
      // Informational events (status="allowed") shouldn't error the stream —
      // they're emitted alongside successful turns to advertise quota state.
      // Surface as a warning if a logger is supplied; otherwise drop silently.
      if (info.status === "allowed") {
        ctx.log?.warn("engine.claude-code.rate_limit_info", {
          status: info.status,
          rateLimitType: info.rateLimitType,
          resetsAt: info.resetsAt,
          isUsingOverage: info.isUsingOverage,
        });
        return null;
      }
      return {
        type: "error",
        error: {
          code: "engine.rate_limited",
          message: `Rate limited; resets at ${info.resetsAt}`,
          recoverable: true,
        },
      };
    }
    default:
      return null;
  }
}

/**
 * Translate the Claude Code SDK's `result.subtype` into the normalized
 * `finalReason` field on the framework's final event. The exhaustive switch
 * catches new SDK subtypes at compile time.
 */
function mapResultSubtype(
  subtype: ResultEvent["subtype"],
): "success" | "max_turns" | "generation_error" | "interrupted" {
  switch (subtype) {
    case "success":
      return "success";
    case "error_max_turns":
      return "max_turns";
    case "error_interrupted":
      return "interrupted";
    case "error_during_generation":
      return "generation_error";
    default: {
      const _exhaustive: never = subtype;
      throw new Error(`unhandled ResultEvent subtype: ${String(_exhaustive)}`);
    }
  }
}
