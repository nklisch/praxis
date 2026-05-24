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
 * Per-session state for the Claude Code event mapper.
 *
 * Claude's wire protocol assigns UUIDs (e.g. `"toolu_01ABC..."`) to tool use
 * blocks (`tool_use.id`). The MCP bridge's worker script independently assigns
 * sequential callCounters (`"1"`, `"2"`, …) when it dispatches to the Praxis
 * tool registry — these are the `ctx.callId` values tool handlers observe.
 *
 * To keep both channels in agreement, this state maintains a monotonically
 * increasing `orderCounter` that increments each time a `tool_use` event
 * arrives, and a `toolIdToCallId` map from Claude UUID → bridge callCounter.
 * The bridge counter resets to 0 at session start; the adapter counter mirrors
 * it. This produces identical `callId` values on both sides:
 *   engine event `tool_call.callId === "1"` ⟺ handler `ctx.callId === "1"`.
 *
 * State is per-session: create a new `ClaudeCodeMapperState` for each
 * `ClaudeCodeEngineSession.send()` call.
 */
export interface ClaudeCodeMapperState {
  /** Monotonically increasing counter, mirrors the bridge's callCounter. */
  orderCounter: number;
  /** Maps Claude tool_use UUID → sequential callId string used by the bridge. */
  toolIdToCallId: Map<string, string>;
}

export function createClaudeCodeMapperState(): ClaudeCodeMapperState {
  return { orderCounter: 0, toolIdToCallId: new Map() };
}

/**
 * Map a Claude Code SDK StreamEvent to a Praxis EngineEvent. Returns null
 * for events with no useful projection (system.init, rate_limit_event we
 * choose to surface as warnings via the log instead).
 *
 * `state` is a per-session mutable accumulator used to translate Claude's UUID
 * tool IDs to the sequential callIds the MCP bridge emits. Pass the same state
 * object for every event in one session's stream; create a fresh one per session.
 */
export function mapClaudeCodeEvent(
  event: StreamEvent,
  ctx: MapStreamEventInput,
  state?: ClaudeCodeMapperState,
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
    case "tool_use": {
      // Translate Claude's UUID tool ID to the sequential callId the bridge uses.
      // The bridge worker increments a callCounter for each tool call in order,
      // starting at 1. We mirror that counter here so both channels agree on the
      // same callId string for the same tool invocation.
      const callId = state
        ? (() => {
            const seq = String(++state.orderCounter);
            state.toolIdToCallId.set(event.toolId, seq);
            return seq;
          })()
        : event.toolId; // fallback: pass through Claude UUID when no state (tests without bridge)
      return {
        type: "tool_call",
        toolName: stripMcpPrefix(event.toolName, ctx.serverName),
        args: event.toolInput,
        callId,
      };
    }
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
      // Translate the Claude UUID back to the sequential callId via the state map.
      // If the UUID is unknown (no state, or unexpected result without prior tool_use),
      // fall through to the raw toolId string as a safe fallback.
      const rawToolId = event.toolId ?? "";
      const resolvedCallId = state?.toolIdToCallId.get(rawToolId) ?? rawToolId;
      return { type: "tool_result", callId: resolvedCallId, result };
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
      // Any status other than "rate_limited" is forward-compatible noise from
      // a future SDK release — log a warning and drop. Do NOT surface as a
      // user-facing error; we don't know what these new statuses mean.
      if (info.status !== "rate_limited") {
        ctx.log?.warn("engine.claude-code.rate_limit_unknown_status", {
          status: info.status,
          rateLimitType: info.rateLimitType,
          resetsAt: info.resetsAt,
        });
        return null;
      }
      const resetIso = new Date(info.resetsAt * 1000).toISOString();
      const overage = info.isUsingOverage ? ", overage billing active" : "";
      return {
        type: "error",
        error: {
          code: "engine.rate_limited",
          message: `Rate limited (${info.rateLimitType} window${overage}); resets at ${resetIso}`,
          recoverable: true,
          details: {
            kind: "rate_limit",
            rateLimitType: info.rateLimitType,
            resetsAt: info.resetsAt,
            isUsingOverage: info.isUsingOverage,
            ...(info.overageStatus !== undefined && { overageStatus: info.overageStatus }),
            ...(info.overageResetsAt !== undefined && { overageResetsAt: info.overageResetsAt }),
          },
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
