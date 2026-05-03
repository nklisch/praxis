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
export function mapClaudeCodeEvent(event: unknown, ctx: MapStreamEventInput): EngineEvent | null {
  if (!event || typeof event !== "object" || !("type" in event)) return null;
  const e = event as Record<string, unknown> & { type: string };
  switch (e.type) {
    case "system":
      return null; // init / metadata; not part of the normalized stream.
    case "assistant": {
      const delta = (e.delta as string | undefined) ?? "";
      const text = (e.text as string | undefined) ?? "";
      // Prefer delta when present; fall back to full text.
      if (delta) return { type: "model_message", content: delta, partial: true };
      return { type: "model_message", content: text, partial: false };
    }
    case "tool_use":
      return {
        type: "tool_call",
        toolName: stripMcpPrefix(String(e.toolName), ctx.serverName),
        args: e.toolInput,
        callId: String(e.toolId),
      };
    case "tool_result": {
      const isError = Boolean(e.isError);
      const content = String(e.content ?? "");
      const result: ToolResult = isError
        ? {
            ok: false,
            error: { code: "tool.sdk_reported_error", message: content, recoverable: false },
          }
        : { ok: true, value: tryParseJson(content), tier: "deterministic" };
      return { type: "tool_result", callId: String(e.toolId ?? ""), result };
    }
    case "result": {
      const usage = (e.usage as Record<string, number> | undefined) ?? {};
      return {
        type: "final",
        usage: {
          inputTokens: Number(usage.inputTokens ?? 0),
          outputTokens: Number(usage.outputTokens ?? 0),
          ...(usage.cacheReadTokens !== undefined && {
            cacheReadTokens: Number(usage.cacheReadTokens),
          }),
          ...(usage.cacheWriteTokens !== undefined && {
            cacheWriteTokens: Number(usage.cacheWriteTokens),
          }),
        },
      };
    }
    case "rate_limit_event": {
      const info = e.rateLimitInfo as
        | { status?: string; resetsAt?: number; rateLimitType?: string; isUsingOverage?: boolean }
        | undefined;
      // Informational events (status="allowed") shouldn't error the stream —
      // they're emitted alongside successful turns to advertise quota state.
      // Surface as a warning if a logger is supplied; otherwise drop silently.
      if (info?.status === "allowed") {
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
          message: `Rate limited; resets at ${info?.resetsAt}`,
          recoverable: true,
        },
      };
    }
    default:
      return null;
  }
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
