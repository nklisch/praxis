import type { EngineEvent, ToolResult } from "@praxis/core/types";

/**
 * Map a Vercel AI SDK `fullStream` part into the normalized EngineEvent.
 * Returns null for parts that don't translate (start, start-step, etc.).
 *
 * Per the conformance bar, deltas are emitted as `model_message` with
 * `partial: true`. The completing `text-end` is emitted as `partial: false`
 * with the full accumulated text so consumers wanting the final string don't
 * need to reassemble.
 */
export function mapVercelPart(part: unknown, state: { textBuf: string }): EngineEvent | null {
  // Defensive: the SDK's part shape is a discriminated union. We narrow by `type`.
  if (!part || typeof part !== "object" || !("type" in part)) return null;
  const p = part as Record<string, unknown> & { type: string };
  switch (p.type) {
    case "text-delta": {
      const delta = String(p.delta ?? "");
      state.textBuf += delta;
      return { type: "model_message", content: delta, partial: true };
    }
    case "text-end": {
      const full = state.textBuf;
      state.textBuf = "";
      return { type: "model_message", content: full, partial: false };
    }
    case "reasoning-delta":
      return { type: "thinking", content: String(p.delta ?? "") };
    case "tool-call":
      return {
        type: "tool_call",
        toolName: String(p.toolName),
        args: p.input,
        callId: String(p.toolCallId),
      };
    case "tool-result": {
      const result: ToolResult = {
        ok: true,
        value: p.output,
        tier: "deterministic", // Tier is not knowable from SDK; default + framework can re-tier from registry.
      };
      return { type: "tool_result", callId: String(p.toolCallId), result };
    }
    case "tool-error": {
      const result: ToolResult = {
        ok: false,
        error: {
          code: "tool.execute_failed",
          message: String((p.error as Error | undefined)?.message ?? "unknown"),
          recoverable: false,
        },
      };
      return { type: "tool_result", callId: String(p.toolCallId), result };
    }
    case "error":
      return {
        type: "error",
        error: {
          code: "engine.stream_error",
          message: String((p.error as Error | undefined)?.message ?? "unknown"),
          recoverable: false,
        },
      };
    case "finish":
      return {
        type: "final",
        usage: {
          inputTokens: Number(
            (p.totalUsage as { inputTokens?: number } | undefined)?.inputTokens ?? 0,
          ),
          outputTokens: Number(
            (p.totalUsage as { outputTokens?: number } | undefined)?.outputTokens ?? 0,
          ),
        },
      };
    default:
      return null;
  }
}
