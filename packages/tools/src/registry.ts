import type {
  Logger,
  ToolContext,
  ToolDefinition,
  ToolDefinitionSummary,
  ToolRegistry,
  ToolResult,
} from "@praxis/core/types";
import { serializeError } from "@praxis/core/types";
import { z } from "zod";

/**
 * Optional per-call metadata passed to `InProcessToolRegistry.dispatch`.
 * Engine adapters supply this to thread the engine-side correlation id
 * through to the tool handler's `ToolContext.callId`, and to propagate
 * the per-turn abort signal so tool handlers and sub-agents can bail
 * when the user clicks Stop.
 */
export interface DispatchMeta {
  /** Engine-side correlation id for this tool invocation. */
  callId?: string;
  /**
   * AbortSignal threaded from the engine's send-turn signal. When the
   * user clicks Stop (or the session is otherwise interrupted), this
   * signal aborts; tool handlers should bail and sub-agents should
   * propagate it further. Optional — test stubs and direct invocations
   * may omit it.
   */
  signal?: AbortSignal;
}

export interface InProcessToolRegistryOptions {
  /** Tool definitions registered into this registry (Zod-schema-typed). */
  tools: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /** Per-session context passed to every tool handler. */
  context: ToolContext;
  /** Logger for dispatch observability. */
  log: Logger;
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
  // NOTE: `readonly` on the field prevents reassignment; the object itself is mutable.
  private readonly context: ToolContext;
  private readonly log: Logger;

  constructor(opts: InProcessToolRegistryOptions) {
    this.context = opts.context;
    this.log = opts.log;
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

  /**
   * Phase 16: mutate a single field on the bound ToolContext after construction.
   * Used by the explorer to inject `draftId` once `draft_init` returns it, so
   * subsequent draft-mutation tools see it without the model threading it
   * explicitly through every arg.
   */
  setContextField<K extends keyof ToolContext>(key: K, value: ToolContext[K]): void {
    (this.context as unknown as Record<string, unknown>)[key as string] = value as unknown;
  }

  async dispatch(name: string, args: unknown, meta?: DispatchMeta): Promise<ToolResult> {
    this.log.debug("tool.dispatch.start", {
      name,
      ...(meta?.callId !== undefined && { callId: meta.callId }),
    });
    const t0 = performance.now();
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
    // Build a per-call context with callId and signal injected when supplied by the engine adapter.
    // We shallow-copy to avoid mutating the registry's stored context. The conditional spread
    // pattern lets us handle all combinations (callId only, signal only, both, neither) without
    // allocating a new object on the common path where neither field is supplied.
    const callContext: ToolContext =
      meta?.callId !== undefined || meta?.signal !== undefined
        ? {
            ...this.context,
            ...(meta.callId !== undefined && { callId: meta.callId }),
            ...(meta.signal !== undefined && { signal: meta.signal }),
          }
        : this.context;
    try {
      const value = await tool.handler(parsed.data, callContext);
      this.log.debug("tool.dispatch.ok", { name, durationMs: Math.round(performance.now() - t0) });
      return { ok: true, value, tier: tool.tier };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.log.warn("tool.dispatch.error", {
        name,
        durationMs: Math.round(performance.now() - t0),
        err: serializeError(cause),
      });
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
