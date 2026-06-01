import type {
  DebugTraceContext,
  DebugTraceRegistry,
  Logger,
  ToolContext,
  ToolDefinition,
  ToolDefinitionSummary,
  ToolDispatchMeta,
  ToolRegistry,
  ToolResult,
} from "@praxis/core/types";
import { serializeError } from "@praxis/core/types";
import { z } from "zod";

export type DispatchMeta = ToolDispatchMeta;

type ToolDispatchError = { code: string; message: string; recoverable: boolean };

export interface InProcessToolRegistryOptions {
  /** Tool definitions registered into this registry (Zod-schema-typed). */
  tools: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /** Per-session context passed to every tool handler. */
  context: ToolContext;
  /** Logger for dispatch observability. */
  log: Logger;
  /** Optional side-channel trace registry for compact dispatch records. */
  debugTrace?: DebugTraceRegistry;
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
  private readonly debugTrace: DebugTraceRegistry | undefined;

  constructor(opts: InProcessToolRegistryOptions) {
    this.context = opts.context;
    this.log = opts.log;
    this.debugTrace = opts.debugTrace;
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
   * Used by the drafter to inject `draftId` once `draft_init` returns it, so
   * subsequent draft-mutation tools see it without the model threading it
   * explicitly through every arg.
   */
  setContextField<K extends keyof ToolContext>(key: K, value: ToolContext[K]): void {
    (this.context as unknown as Record<string, unknown>)[key as string] = value as unknown;
  }

  async dispatch(name: string, args: unknown, meta?: DispatchMeta): Promise<ToolResult> {
    const callTrace = buildCallTrace(meta, this.context.debugTrace);
    const traceFields = traceLogFields(callTrace);
    this.log.debug("tool.dispatch.start", {
      name,
      ...traceFields,
    });
    const t0 = performance.now();
    this.recordTrace({
      type: "tool_dispatch_start",
      trace: callTrace,
      toolName: name,
    });
    const tool = this.tools.get(name);
    if (!tool) {
      const result: ToolResult = {
        ok: false,
        error: { code: "tool.not_found", message: `Unknown tool: ${name}`, recoverable: false },
      };
      this.recordDispatchFailure(name, callTrace, t0, result.error);
      return result;
    }
    const parsed = tool.input.safeParse(args);
    if (!parsed.success) {
      const result: ToolResult = {
        ok: false,
        error: {
          code: "tool.invalid_args",
          message: `Args failed validation for tool "${name}": ${parsed.error.message}`,
          recoverable: true,
        },
      };
      this.recordDispatchFailure(name, callTrace, t0, result.error);
      return result;
    }
    const callContext = this.buildCallContext(meta, callTrace);
    try {
      const value = await tool.handler(parsed.data, callContext);
      const durationMs = Math.round(performance.now() - t0);
      this.log.debug("tool.dispatch.ok", { name, durationMs, ...traceFields });
      this.recordTrace({
        type: "tool_dispatch_end",
        trace: callTrace,
        toolName: name,
        ok: true,
        durationMs,
      });
      return { ok: true, value, tier: tool.tier };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const durationMs = Math.round(performance.now() - t0);
      this.log.warn("tool.dispatch.error", {
        name,
        durationMs,
        ...traceFields,
        err: serializeError(cause),
      });
      const result: ToolResult = {
        ok: false,
        error: { code: "tool.handler_threw", message, recoverable: false },
      };
      this.recordTrace({
        type: "tool_dispatch_end",
        trace: callTrace,
        toolName: name,
        ok: false,
        durationMs,
        summary: summarizeToolError(result.error),
      });
      return result;
    }
  }

  private buildCallContext(
    meta: DispatchMeta | undefined,
    callTrace: DebugTraceContext | undefined,
  ) {
    if (meta?.callId === undefined && meta?.signal === undefined && callTrace === undefined) {
      return this.context;
    }
    return {
      ...this.context,
      ...(meta?.callId !== undefined && { callId: meta.callId }),
      ...(meta?.signal !== undefined && { signal: meta.signal }),
      ...(callTrace !== undefined && { debugTrace: callTrace }),
    } satisfies ToolContext;
  }

  private recordDispatchFailure(
    name: string,
    trace: DebugTraceContext | undefined,
    startedAt: number,
    error: ToolDispatchError,
  ): void {
    const durationMs = Math.round(performance.now() - startedAt);
    const traceFields = traceLogFields(trace);
    this.log.warn("tool.dispatch.error", {
      name,
      durationMs,
      ...traceFields,
      err: error,
    });
    this.recordTrace({
      type: "tool_dispatch_end",
      trace,
      toolName: name,
      ok: false,
      durationMs,
      summary: summarizeToolError(error),
    });
  }

  private recordTrace(
    input:
      | { type: "tool_dispatch_start"; trace: DebugTraceContext | undefined; toolName: string }
      | {
          type: "tool_dispatch_end";
          trace: DebugTraceContext | undefined;
          toolName: string;
          ok: boolean;
          durationMs: number;
          summary?: string;
        },
  ): void {
    if (this.debugTrace === undefined || input.trace === undefined) return;
    try {
      if (input.type === "tool_dispatch_start") {
        this.debugTrace.record({
          type: input.type,
          trace: input.trace,
          toolName: input.toolName,
        });
        return;
      }
      this.debugTrace.record({
        type: input.type,
        trace: input.trace,
        toolName: input.toolName,
        ok: input.ok,
        durationMs: input.durationMs,
        ...(input.summary !== undefined && { summary: input.summary }),
      });
    } catch (cause) {
      this.log.warn("tool.dispatch.trace_record_failed", { err: serializeError(cause) });
    }
  }
}

function buildCallTrace(
  meta: DispatchMeta | undefined,
  baseTrace: DebugTraceContext | undefined,
): DebugTraceContext | undefined {
  const trace = meta?.trace ?? baseTrace;
  if (trace === undefined) return undefined;
  return {
    ...trace,
    ...(meta?.callId !== undefined && { callId: meta.callId }),
  };
}

function traceLogFields(trace: DebugTraceContext | undefined): Record<string, unknown> {
  if (trace === undefined) return {};
  return {
    runId: trace.runId,
    sessionId: trace.sessionId,
    ...(trace.turnId !== undefined && { turnId: trace.turnId }),
    ...(trace.turnIndex !== undefined && { turnIndex: trace.turnIndex }),
    ...(trace.callId !== undefined && { callId: trace.callId }),
  };
}

function summarizeToolError(error: { code: string; message: string }): string {
  return `${error.code}: ${error.message}`;
}

/**
 * Convert a Zod schema to JSON Schema using Zod 4's built-in `z.toJSONSchema()`.
 * Centralized here so engine adapters can rely on a single conversion path.
 */
export function jsonSchemaFromZod(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, { unrepresentable: "any" });
}
