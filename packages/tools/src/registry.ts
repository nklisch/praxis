import type {
  ToolContext,
  ToolDefinition,
  ToolDefinitionSummary,
  ToolRegistry,
  ToolResult,
} from "@praxis/core/types";
import { z } from "zod";

export interface InProcessToolRegistryOptions {
  /** Tool definitions registered into this registry (Zod-schema-typed). */
  tools: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /** Per-session context passed to every tool handler. */
  context: ToolContext;
}

/**
 * Concrete in-process implementation of `ToolRegistry`. Holds the Zod-typed
 * `ToolDefinition` set behind the JSON-Schema-friendly `ToolRegistry` surface.
 * Engine adapters that need the original Zod schema may read it via
 * `summary.inputSchemaNative` (typed as `unknown` on the contract; checked via
 * `instanceof z.ZodType` at the call site).
 */
export class InProcessToolRegistry implements ToolRegistry {
  private readonly tools: Map<string, ToolDefinition<z.ZodType, z.ZodType>>;
  private readonly summaries: ToolDefinitionSummary[];
  private readonly context: ToolContext;

  constructor(opts: InProcessToolRegistryOptions) {
    this.context = opts.context;
    this.tools = new Map();
    this.summaries = [];
    for (const tool of opts.tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Tool "${tool.name}" registered twice`);
      }
      this.tools.set(tool.name, tool);
      this.summaries.push({
        name: tool.name,
        description: tool.description,
        inputSchemaJson: jsonSchemaFromZod(tool.input),
        inputSchemaNative: tool.input,
        tier: tool.tier,
      });
    }
  }

  list(): ToolDefinitionSummary[] {
    return this.summaries;
  }

  async dispatch(name: string, args: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        error: { code: "tool.not_found", message: `Unknown tool: ${name}`, recoverable: false },
      };
    }
    const parsed = tool.input.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "tool.invalid_args",
          message: `Args failed validation for tool "${name}": ${parsed.error.message}`,
          recoverable: true,
        },
      };
    }
    try {
      const value = await tool.handler(parsed.data, this.context);
      return { ok: true, value, tier: tool.tier };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        error: { code: "tool.handler_threw", message, recoverable: false },
      };
    }
  }
}

/**
 * Convert a Zod schema to JSON Schema using Zod 4's built-in `z.toJSONSchema()`.
 * Centralized here so engine adapters can rely on a single conversion path.
 */
export function jsonSchemaFromZod(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, { unrepresentable: "any" });
}
