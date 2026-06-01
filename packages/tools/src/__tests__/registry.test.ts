import type {
  DebugTraceContext,
  DebugTraceRecord,
  DebugTraceRecordInput,
  Logger,
  Timestamp,
  ToolContext,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { recordingLogger } from "../../../../tests/helpers/mocks.js";
import { InProcessToolRegistry } from "../registry.js";
import { echoTool, nowTool } from "../test-tools/index.js";

function makeEmptyPedagogyPackService() {
  return {
    current: () => null,
    listStrategies: () => [],
    getStrategy: () => null,
    listTechniques: () => [],
    getTechnique: () => null,
    listMetacognitivePrompts: () => [],
  };
}

const ctx: ToolContext = {
  studentId: brandId<"StudentId">("student-1"),
  sessionId: brandId<"SessionId">("session-1"),
  services: {
    // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in this test
    memory: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in this test
    artifacts: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in this test
    bootstrap: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in this test
    courseState: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 5 placeholder — not used in this test
    vectorStore: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 5 placeholder — not used in this test
    ftsStore: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 5 placeholder — not used in this test
    embeddings: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 5 placeholder — not used in this test
    documents: null as any,
    sandbox: { availableLanguages: ["javascript", "python"], run: vi.fn() },
    sympy: {
      checkSolution: vi.fn(),
      solveEquation: vi.fn(),
      simplify: vi.fn(),
      checkEquivalent: vi.fn(),
      parseLatex: vi.fn(),
    },
    pedagogyPack: makeEmptyPedagogyPackService(),
    // biome-ignore lint/suspicious/noExplicitAny: Phase 11 placeholder — not used in this test
    lock: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 11 placeholder — not used in this test
    authoring: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
    notes: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
    flashcards: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
    fsrsScheduler: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder — not used in this test
    packs: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 8 placeholder — not used in this test
    assignments: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 16 placeholder — not used in this test
    documentScopes: null as any,
    // biome-ignore lint/suspicious/noExplicitAny: Phase 16 placeholder — not used in this test
    engineResolver: null as any,
  },
  log: (() => {
    const l: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => l,
    };
    return l;
  })(),
};

function makeTraceRegistry() {
  const records: DebugTraceRecord[] = [];
  return {
    records,
    registry: {
      record(input: DebugTraceRecordInput): DebugTraceRecord {
        const record = { ...input, recordedAt: 1 as Timestamp };
        records.push(record);
        return record;
      },
      list: () => records,
      findByRunId: (runId: string) => records.filter((record) => record.trace.runId === runId),
      findBySessionId: (sessionId: string) =>
        records.filter((record) => record.trace.sessionId === sessionId),
      findByTurnId: (turnId: string) => records.filter((record) => record.trace.turnId === turnId),
      clear: () => {
        records.length = 0;
      },
    },
  };
}

const turnTrace: DebugTraceContext = {
  runId: "run-1",
  sessionId: brandId<"SessionId">("session-1"),
  turnId: "session-1:turn:2",
  turnIndex: 2,
};

describe("InProcessToolRegistry", () => {
  it("constructs with echo and now tools", () => {
    const registry = new InProcessToolRegistry({
      tools: [echoTool, nowTool],
      context: ctx,
      log: ctx.log,
    });
    expect(registry.list()).toHaveLength(2);
  });

  it("list() returns summaries with inputSchemaJson and inputSchemaNative", () => {
    const registry = new InProcessToolRegistry({
      tools: [echoTool, nowTool],
      context: ctx,
      log: ctx.log,
    });
    const summaries = registry.list();
    for (const s of summaries) {
      expect(s.inputSchemaJson).toBeDefined();
      expect(s.inputSchemaNative).toBeInstanceOf(z.ZodType);
    }
  });

  it("dispatch echo returns echoed value", async () => {
    const registry = new InProcessToolRegistry({ tools: [echoTool], context: ctx, log: ctx.log });
    const result = await registry.dispatch("test.echo", { text: "hi" });
    expect(result).toEqual({ ok: true, value: { echoed: "hi" }, tier: "deterministic" });
  });

  it("dispatch echo with wrong args returns tool.invalid_args", async () => {
    const registry = new InProcessToolRegistry({ tools: [echoTool], context: ctx, log: ctx.log });
    const result = await registry.dispatch("test.echo", { wrong: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("tool.invalid_args");
      expect(result.error.recoverable).toBe(true);
    }
  });

  it("dispatch unknown tool returns tool.not_found", async () => {
    const registry = new InProcessToolRegistry({ tools: [echoTool], context: ctx, log: ctx.log });
    const result = await registry.dispatch("missing", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("tool.not_found");
    }
  });

  it("throws synchronously on duplicate tool names", () => {
    expect(() => {
      new InProcessToolRegistry({ tools: [echoTool, echoTool], context: ctx, log: ctx.log });
    }).toThrow(`Tool "test.echo" registered twice`);
  });

  it("dispatch with meta.callId threads callId into ToolContext", async () => {
    let capturedCallId: string | undefined = "initial-sentinel";

    const callIdCaptureTool = {
      name: "test.capture_call_id",
      description: "Captures the callId from ToolContext",
      input: z.object({}),
      output: z.object({ callId: z.string().optional() }),
      tier: "deterministic" as const,
      effects: [] as const,
      async handler(_args: unknown, toolCtx: import("@praxis/core/types").ToolContext) {
        capturedCallId = toolCtx.callId;
        return { callId: toolCtx.callId };
      },
    };

    const registry = new InProcessToolRegistry({
      tools: [callIdCaptureTool],
      context: ctx,
      log: ctx.log,
    });

    await registry.dispatch("test.capture_call_id", {}, { callId: "abc-123" });
    expect(capturedCallId).toBe("abc-123");

    // Without meta, callId should be undefined (base ctx has no callId).
    capturedCallId = "initial-sentinel";
    await registry.dispatch("test.capture_call_id", {});
    expect(capturedCallId).toBeUndefined();
  });

  it("dispatch with meta.callId does not mutate the registry's stored context", async () => {
    let ctx1CallId: string | undefined;
    let ctx2CallId: string | undefined;

    const captureCtxTool = {
      name: "test.capture_ctx",
      description: "Captures context callId",
      input: z.object({}),
      output: z.object({}),
      tier: "deterministic" as const,
      effects: [] as const,
      async handler(_args: unknown, toolCtx: import("@praxis/core/types").ToolContext) {
        if (ctx1CallId === undefined) {
          ctx1CallId = toolCtx.callId;
        } else {
          ctx2CallId = toolCtx.callId;
        }
        return {};
      },
    };

    const registry = new InProcessToolRegistry({
      tools: [captureCtxTool],
      context: ctx,
      log: ctx.log,
    });

    await registry.dispatch("test.capture_ctx", {}, { callId: "first" });
    await registry.dispatch("test.capture_ctx", {}, { callId: "second" });

    // Each dispatch should see its own callId, not the other's.
    expect(ctx1CallId).toBe("first");
    expect(ctx2CallId).toBe("second");
  });

  it("dispatch with meta.signal threads signal into ToolContext", async () => {
    let capturedSignal: AbortSignal | undefined;

    const signalCaptureTool = {
      name: "test.capture_signal",
      description: "Captures the AbortSignal from ToolContext",
      input: z.object({}),
      output: z.object({}),
      tier: "deterministic" as const,
      effects: [] as const,
      async handler(_args: unknown, toolCtx: import("@praxis/core/types").ToolContext) {
        capturedSignal = toolCtx.signal;
        return {};
      },
    };

    const registry = new InProcessToolRegistry({
      tools: [signalCaptureTool],
      context: ctx,
      log: ctx.log,
    });

    const controller = new AbortController();
    await registry.dispatch("test.capture_signal", {}, { signal: controller.signal });
    expect(capturedSignal).toBe(controller.signal);
  });

  it("dispatch without meta results in ctx.signal === undefined", async () => {
    let capturedSignal: AbortSignal | undefined;
    let signalWasCaptured = false;

    const signalCaptureTool = {
      name: "test.capture_signal_absent",
      description: "Captures the AbortSignal (or lack thereof) from ToolContext",
      input: z.object({}),
      output: z.object({}),
      tier: "deterministic" as const,
      effects: [] as const,
      async handler(_args: unknown, toolCtx: import("@praxis/core/types").ToolContext) {
        capturedSignal = toolCtx.signal;
        signalWasCaptured = true;
        return {};
      },
    };

    const registry = new InProcessToolRegistry({
      tools: [signalCaptureTool],
      context: ctx,
      log: ctx.log,
    });

    await registry.dispatch("test.capture_signal_absent", {});
    expect(signalWasCaptured).toBe(true);
    expect(capturedSignal).toBeUndefined();
  });

  it("dispatch with meta.callId but no signal results in ctx.signal === undefined and correct callId", async () => {
    let capturedCallId: string | undefined;
    let capturedSignal: AbortSignal | undefined;
    let signalWasCaptured = false;

    const captureAllTool = {
      name: "test.capture_all",
      description: "Captures callId and signal from ToolContext",
      input: z.object({}),
      output: z.object({}),
      tier: "deterministic" as const,
      effects: [] as const,
      async handler(_args: unknown, toolCtx: import("@praxis/core/types").ToolContext) {
        capturedCallId = toolCtx.callId;
        capturedSignal = toolCtx.signal;
        signalWasCaptured = true;
        return {};
      },
    };

    const registry = new InProcessToolRegistry({
      tools: [captureAllTool],
      context: ctx,
      log: ctx.log,
    });

    await registry.dispatch("test.capture_all", {}, { callId: "call-xyz" });
    expect(capturedCallId).toBe("call-xyz");
    expect(signalWasCaptured).toBe(true);
    expect(capturedSignal).toBeUndefined();
  });

  it("threads callId, signal, and debugTrace into a per-call copied context", async () => {
    const { registry: debugTrace, records } = makeTraceRegistry();
    const log = recordingLogger();
    const controller = new AbortController();
    let captured: Pick<ToolContext, "callId" | "signal" | "debugTrace"> | undefined;

    const captureTool = {
      name: "test.capture_trace_context",
      description: "Captures call context",
      input: z.object({}),
      output: z.object({}),
      tier: "deterministic" as const,
      effects: [] as const,
      async handler(_args: unknown, toolCtx: ToolContext) {
        captured = {
          callId: toolCtx.callId,
          signal: toolCtx.signal,
          debugTrace: toolCtx.debugTrace,
        };
        return {};
      },
    };

    const registry = new InProcessToolRegistry({
      tools: [captureTool],
      context: ctx,
      log,
      debugTrace,
    });

    await registry.dispatch(
      "test.capture_trace_context",
      {},
      {
        callId: "call-123",
        signal: controller.signal,
        trace: turnTrace,
      },
    );

    expect(captured?.callId).toBe("call-123");
    expect(captured?.signal).toBe(controller.signal);
    expect(captured?.debugTrace).toEqual({ ...turnTrace, callId: "call-123" });
    expect(ctx.callId).toBeUndefined();
    expect(ctx.signal).toBeUndefined();
    expect(ctx.debugTrace).toBeUndefined();

    expect(records.map((record) => record.type)).toEqual([
      "tool_dispatch_start",
      "tool_dispatch_end",
    ]);
    expect(records[0]?.trace).toEqual({ ...turnTrace, callId: "call-123" });
    expect(records[1]).toMatchObject({
      type: "tool_dispatch_end",
      toolName: "test.capture_trace_context",
      ok: true,
    });

    const startLog = log.records.find((record) => record.message === "tool.dispatch.start");
    const okLog = log.records.find((record) => record.message === "tool.dispatch.ok");
    expect(startLog?.fields).toMatchObject({
      name: "test.capture_trace_context",
      runId: "run-1",
      turnId: "session-1:turn:2",
      sessionId: "session-1",
      turnIndex: 2,
      callId: "call-123",
    });
    expect(okLog?.fields).toMatchObject({
      name: "test.capture_trace_context",
      runId: "run-1",
      turnId: "session-1:turn:2",
      sessionId: "session-1",
      turnIndex: 2,
      callId: "call-123",
    });
  });

  it("records thrown handler failure before any sub-agent trace starts", async () => {
    const { registry: debugTrace, records } = makeTraceRegistry();
    const log = recordingLogger();

    const throwingTool = {
      name: "test.throw_before_subagent",
      description: "Throws before starting a sub-agent",
      input: z.object({}),
      output: z.object({}),
      tier: "deterministic" as const,
      effects: [] as const,
      async handler() {
        throw new Error("boom before sub-agent");
      },
    };

    const registry = new InProcessToolRegistry({
      tools: [throwingTool],
      context: ctx,
      log,
      debugTrace,
    });

    const result = await registry.dispatch(
      "test.throw_before_subagent",
      {},
      {
        callId: "call-before-subagent",
        trace: turnTrace,
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "tool.handler_threw", message: "boom before sub-agent" },
    });
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      type: "tool_dispatch_end",
      toolName: "test.throw_before_subagent",
      ok: false,
      summary: "tool.handler_threw: boom before sub-agent",
      trace: { ...turnTrace, callId: "call-before-subagent" },
    });
    expect(records.some((record) => record.type === "subagent_event")).toBe(false);

    const errorLog = log.records.find((record) => record.message === "tool.dispatch.error");
    expect(errorLog?.fields).toMatchObject({
      name: "test.throw_before_subagent",
      runId: "run-1",
      turnId: "session-1:turn:2",
      sessionId: "session-1",
      callId: "call-before-subagent",
    });
  });
});
