import type { ToolRegistry } from "@praxis/core/types";
import { jsonSchema, type Tool, tool } from "ai";

/**
 * Convert the Praxis ToolRegistry into a record suitable for `streamText({ tools })`.
 * Each Vercel `tool` wraps a call to `registry.dispatch`. The Vercel SDK runs the
 * `execute` function automatically inside its agentic loop and feeds the result back
 * to the model.
 *
 * The Vercel AI SDK's `execute` callback receives `{ toolCallId, ... }` as its second
 * argument. We thread `toolCallId` through as `meta.callId` so tool handlers that spawn
 * sub-agents can publish events keyed on the parent session's tool_call.callId.
 *
 * `getSignal` is an optional getter for the per-turn AbortSignal. Called at tool-dispatch
 * time (inside `execute`) so we always capture the current turn's signal. The adapter
 * stores the signal on a mutable ref set at the start of `send()` and cleared in finally.
 */
export function toVercelTools(
  registry: ToolRegistry,
  getSignal?: () => AbortSignal | undefined,
): Record<string, Tool> {
  const summaries = registry.list();
  const out: Record<string, Tool> = {};
  for (const summary of summaries) {
    out[summary.name] = tool({
      description: summary.description,
      inputSchema: jsonSchema(summary.inputSchemaJson as object),
      execute: async (input: unknown, { toolCallId }: { toolCallId: string }) => {
        const signal = getSignal?.();
        const result = await registry.dispatch(summary.name, input, {
          callId: toolCallId,
          ...(signal !== undefined && { signal }),
        });
        if (result.ok) return result.value;
        // Throw so Vercel SDK emits a tool-error event we can map.
        const err = new Error(result.error.message);
        (err as Error & { code?: string }).code = result.error.code;
        throw err;
      },
    });
  }
  return out;
}
