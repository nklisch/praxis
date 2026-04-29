import type { ToolRegistry } from "@praxis/core/types";
import { jsonSchema, type Tool, tool } from "ai";

/**
 * Convert the Praxis ToolRegistry into a record suitable for `streamText({ tools })`.
 * Each Vercel `tool` wraps a call to `registry.dispatch`. The Vercel SDK runs the
 * `execute` function automatically inside its agentic loop and feeds the result back
 * to the model.
 */
export function toVercelTools(registry: ToolRegistry): Record<string, Tool> {
  const summaries = registry.list();
  const out: Record<string, Tool> = {};
  for (const summary of summaries) {
    out[summary.name] = tool({
      description: summary.description,
      inputSchema: jsonSchema(summary.inputSchemaJson as object),
      execute: async (input: unknown) => {
        const result = await registry.dispatch(summary.name, input);
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
