import type { EngineEvent, ToolResult } from "@praxis/core/types";
import { newCallId } from "../util/event-id.js";

interface MapState {
  /** Maps Codex item index → synthesized callId for tool_call/tool_result pairing. */
  toolCallIds: Map<number, string>;
}

export function newMapState(): MapState {
  return { toolCallIds: new Map() };
}

export interface MapCodexEventInput {
  serverName: string;
}

/**
 * Map a Codex ThreadEvent into one or more EngineEvents. Codex emits
 * coarse-grained items (no per-token deltas), so item.completed for
 * agent_message yields a single non-partial model_message. mcp_tool_call
 * items emit a tool_call followed by a tool_result derived from the same item.
 */
export function mapCodexEvent(
  event: unknown,
  ctx: MapCodexEventInput,
  state: MapState,
  itemIndex: { value: number },
): EngineEvent[] {
  if (!event || typeof event !== "object" || !("type" in event)) return [];
  const e = event as Record<string, unknown> & { type: string };
  switch (e.type) {
    case "thread.started":
    case "turn.started":
    case "item.started":
    case "item.updated":
      return [];
    case "item.completed":
      return mapItemCompleted(e.item, ctx, state, itemIndex);
    case "turn.completed": {
      const usage = (e.usage as Record<string, number> | undefined) ?? {};
      const cacheRead = usage.cached_input_tokens;
      return [
        {
          type: "final",
          usage: {
            inputTokens: Number(usage.input_tokens ?? 0),
            outputTokens: Number(usage.output_tokens ?? 0),
            ...(cacheRead !== undefined && { cacheReadTokens: Number(cacheRead) }),
          },
        },
      ];
    }
    case "turn.failed":
    case "error":
      return [
        {
          type: "error",
          error: {
            code: "engine.turn_failed",
            message: String(
              ((e.error as { message?: string } | undefined) ?? e).message ?? "unknown",
            ),
            recoverable: false,
          },
        },
      ];
    default:
      return [];
  }
}

function mapItemCompleted(
  itemUnknown: unknown,
  ctx: MapCodexEventInput,
  state: MapState,
  itemIndex: { value: number },
): EngineEvent[] {
  if (!itemUnknown || typeof itemUnknown !== "object" || !("type" in itemUnknown)) return [];
  const item = itemUnknown as Record<string, unknown> & { type: string };
  const idx = itemIndex.value++;
  switch (item.type) {
    case "agent_message":
      return [{ type: "model_message", content: String(item.text ?? ""), partial: false }];
    case "reasoning":
      return [{ type: "thinking", content: String(item.text ?? "") }];
    case "mcp_tool_call": {
      const server = String(item.server ?? "");
      if (server !== ctx.serverName) return []; // Built-in or other-server tools are framework-invisible in Phase 2.
      const toolName = String(item.tool ?? "");
      const args = item.arguments ?? {};
      const callId = newCallId();
      state.toolCallIds.set(idx, callId);
      const events: EngineEvent[] = [{ type: "tool_call", toolName, args, callId }];
      const status = String(item.status ?? "");
      if (status === "completed") {
        const error = item.error as { message?: string } | undefined;
        const result: ToolResult = error
          ? {
              ok: false,
              error: {
                code: "tool.codex_error",
                message: String(error.message ?? "unknown"),
                recoverable: false,
              },
            }
          : { ok: true, value: item.result, tier: "deterministic" };
        events.push({ type: "tool_result", callId, result });
      }
      return events;
    }
    default:
      return [];
  }
}
