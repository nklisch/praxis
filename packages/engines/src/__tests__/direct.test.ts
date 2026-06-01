import type {
  EngineOpenOptions,
  ToolDefinitionSummary,
  ToolRegistry,
  ToolResult,
} from "@praxis/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the `ai` module before any imports that depend on it.
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: vi.fn(),
    stepCountIs: vi.fn((n: number) => ({ stepCountIs: n })),
  };
});

// Mock provider SDKs to avoid network/API calls
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ modelId: "claude-sonnet-4-5" })),
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => ({ modelId: "gpt-4o" })),
}));
vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => ({ modelId: "gemini-2.5-flash" })),
}));
vi.mock("ollama-ai-provider-v2", () => ({
  createOllama: vi.fn(() => vi.fn(() => ({ modelId: "llama3.2" }))),
}));

describe("DirectEngine — lifecycle", () => {
  const _depLog = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: (): typeof _depLog => _depLog,
  };
  const deps = { log: _depLog };

  const echoSummary: ToolDefinitionSummary = {
    name: "test.echo",
    description: "Echo tool",
    inputSchemaJson: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    tier: "deterministic",
  };

  const emptyRegistry: ToolRegistry = {
    list: () => [],
    dispatch: vi.fn(
      async (): Promise<ToolResult> => ({
        ok: false,
        error: { code: "tool.not_found", message: "no tools", recoverable: false },
      }),
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("id is direct.<provider>", async () => {
    const { DirectEngine } = await import("../direct/adapter.js");
    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps,
      provider: "anthropic",
    });
    expect(engine.id).toBe("direct.anthropic");
    expect(engine.kind).toBe("single-shot");
  });

  it("open() returns a session with a non-empty id", async () => {
    const { streamText } = await import("ai");
    const { DirectEngine } = await import("../direct/adapter.js");

    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () {
        yield { type: "finish", totalUsage: { inputTokens: 0, outputTokens: 0 } };
      })() as unknown as ReturnType<typeof streamText>["fullStream"],
    } as unknown as ReturnType<typeof streamText>);

    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps,
      provider: "anthropic",
    });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    expect(session.id).toBeTruthy();
    await session.close();
  });

  it("two sends on the same session reuse the messages array (streamText called twice)", async () => {
    const { streamText } = await import("ai");
    const { DirectEngine } = await import("../direct/adapter.js");

    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", delta: "reply" };
        yield { type: "text-end" };
        yield { type: "finish", totalUsage: { inputTokens: 1, outputTokens: 1 } };
      })() as unknown as ReturnType<typeof streamText>["fullStream"],
    } as unknown as ReturnType<typeof streamText>);

    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps,
      provider: "anthropic",
    });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    // first send
    for await (const _ of session.send("first")) {
      /* drain */
    }
    // second send (streamText must be called again — session reused)
    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", delta: "second reply" };
        yield { type: "text-end" };
        yield { type: "finish", totalUsage: { inputTokens: 1, outputTokens: 1 } };
      })() as unknown as ReturnType<typeof streamText>["fullStream"],
    } as unknown as ReturnType<typeof streamText>);
    for await (const _ of session.send("second")) {
      /* drain */
    }

    expect(vi.mocked(streamText)).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it("emits model_message, tool_call, tool_result, final from fullStream", async () => {
    const { streamText } = await import("ai");
    const { DirectEngine } = await import("../direct/adapter.js");

    const toolCallId = "call-1";

    async function* fakeFullStream() {
      yield { type: "text-delta", delta: "Calling echo..." };
      yield { type: "text-end" };
      yield { type: "tool-call", toolName: "test.echo", toolCallId, input: { text: "hello" } };
      yield { type: "tool-result", toolCallId, output: { echoed: "hello" } };
      yield { type: "text-delta", delta: "...done" };
      yield { type: "text-end" };
      yield {
        type: "finish",
        totalUsage: { inputTokens: 10, outputTokens: 20 },
      };
    }

    vi.mocked(streamText).mockReturnValue({
      fullStream: fakeFullStream() as unknown as ReturnType<typeof streamText>["fullStream"],
    } as unknown as ReturnType<typeof streamText>);

    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps,
      provider: "anthropic",
    });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    const events = [];
    for await (const event of session.send("Hello")) {
      events.push(event);
    }
    await session.close();

    const types = events.map((e) => e.type);
    expect(types).toContain("model_message");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types).toContain("final");

    const toolCall = events.find((e) => e.type === "tool_call");
    expect(toolCall).toMatchObject({ type: "tool_call", toolName: "test.echo" });

    const finalEvent = events.find((e) => e.type === "final");
    expect(finalEvent).toMatchObject({
      type: "final",
      usage: { inputTokens: 10, outputTokens: 20 },
    });
  });

  it("close() clears the messages array (idempotent)", async () => {
    const { streamText } = await import("ai");
    const { DirectEngine } = await import("../direct/adapter.js");

    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () {
        yield { type: "finish", totalUsage: { inputTokens: 0, outputTokens: 0 } };
      })() as unknown as ReturnType<typeof streamText>["fullStream"],
    } as unknown as ReturnType<typeof streamText>);

    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps,
      provider: "anthropic",
    });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    // close twice — should not throw
    await session.close();
    await session.close();
  });

  it("tool-error part emits tool_result with ok:false", async () => {
    const { streamText } = await import("ai");
    const { DirectEngine } = await import("../direct/adapter.js");

    async function* fakeFullStream() {
      yield {
        type: "tool-error",
        toolCallId: "call-err",
        error: new Error("dispatch failed"),
      };
      yield { type: "finish", totalUsage: { inputTokens: 0, outputTokens: 0 } };
    }

    vi.mocked(streamText).mockReturnValue({
      fullStream: fakeFullStream() as unknown as ReturnType<typeof streamText>["fullStream"],
    } as unknown as ReturnType<typeof streamText>);

    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps,
      provider: "anthropic",
    });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    const events = [];
    for await (const event of session.send("Hello")) {
      events.push(event);
    }
    await session.close();

    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult).toBeDefined();
    if (toolResult?.type === "tool_result") {
      expect(toolResult.result.ok).toBe(false);
    }
  });

  it("tool dispatch routes through registry.dispatch", async () => {
    const { streamText } = await import("ai");
    const { DirectEngine } = await import("../direct/adapter.js");

    let capturedTools: Record<string, unknown> = {};

    vi.mocked(streamText).mockImplementation((opts) => {
      capturedTools = (opts as { tools?: Record<string, unknown> }).tools ?? {};
      return {
        fullStream: (async function* () {
          yield { type: "finish", totalUsage: { inputTokens: 0, outputTokens: 0 } };
        })() as unknown as ReturnType<typeof streamText>["fullStream"],
      } as unknown as ReturnType<typeof streamText>;
    });

    const dispatchSpy = vi.fn(
      async (): Promise<ToolResult> => ({
        ok: true,
        value: { echoed: "hello" },
        tier: "deterministic",
      }),
    );
    const registry: ToolRegistry = {
      list: () => [echoSummary],
      dispatch: dispatchSpy,
    };

    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps,
      provider: "anthropic",
    });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: registry });
    for await (const _ of session.send("Hello")) {
      /* drain */
    }
    await session.close();

    const echoCaptured = capturedTools["test.echo"] as {
      execute?: (args: unknown, opts: { toolCallId: string }) => Promise<unknown>;
    };
    if (echoCaptured?.execute) {
      await echoCaptured.execute({ text: "hello" }, { toolCallId: "test-call-id" });
      expect(dispatchSpy).toHaveBeenCalledWith(
        "test.echo",
        { text: "hello" },
        expect.objectContaining({ callId: "test-call-id" }),
      );
    }
  });

  it("health returns ok", async () => {
    const { DirectEngine } = await import("../direct/adapter.js");
    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps,
      provider: "anthropic",
    });
    const health = await engine.health();
    expect(health.ok).toBe(true);
  });

  it("priorTurns seed populates the messages array before first send", async () => {
    const { streamText } = await import("ai");
    const { DirectEngine } = await import("../direct/adapter.js");

    let capturedMessages: unknown[] = [];
    vi.mocked(streamText).mockImplementation((opts) => {
      // Snapshot the array at call time — the adapter mutates messages[] after streamText returns.
      capturedMessages = [...((opts as { messages?: unknown[] }).messages ?? [])];
      return {
        fullStream: (async function* () {
          yield { type: "text-delta", delta: "reply" };
          yield { type: "text-end" };
          yield { type: "finish", totalUsage: { inputTokens: 0, outputTokens: 0 } };
        })() as unknown as ReturnType<typeof streamText>["fullStream"],
      } as unknown as ReturnType<typeof streamText>;
    });

    const openOpts: EngineOpenOptions = {
      systemPrompt: "You are a tutor.",
      tools: emptyRegistry,
      priorTurns: [
        { role: "user", content: "previous question" },
        { role: "assistant", content: "previous answer" },
      ],
    };

    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps,
      provider: "anthropic",
    });
    const session = await engine.open(openOpts);
    for await (const _ of session.send("new question")) {
      /* drain */
    }
    await session.close();

    // messages should contain the 2 prior turns + 1 new user message = 3 total
    expect(capturedMessages).toHaveLength(3);
  });
});

describe("DirectEngine — toVercelTools callId threading", () => {
  it("execute passes toolCallId as meta.callId to registry.dispatch", async () => {
    const { toVercelTools } = await import("../direct/tool-conversion.js");

    const dispatchMock = vi.fn(
      async (): Promise<ToolResult> => ({
        ok: true,
        value: { echoed: "hello" },
        tier: "deterministic",
      }),
    );

    const registry: ToolRegistry = {
      list: () => [
        {
          name: "test.echo",
          description: "Echo",
          inputSchemaJson: { type: "object", properties: {}, additionalProperties: true },
          tier: "deterministic",
        },
      ],
      dispatch: dispatchMock,
    };

    const vercelTools = toVercelTools(registry);
    const echoTool = vercelTools["test.echo"];
    expect(echoTool).toBeDefined();
    if (!echoTool) return;

    // Simulate Vercel SDK calling execute with toolCallId in the second arg.
    // biome-ignore lint/suspicious/noExplicitAny: accessing execute on Vercel tool type
    const execute = (echoTool as any).execute as (
      input: unknown,
      opts: { toolCallId: string },
    ) => Promise<unknown>;

    expect(execute).toBeDefined();
    await execute({ text: "hello" }, { toolCallId: "vercel-call-xyz" });

    expect(dispatchMock).toHaveBeenCalledWith(
      "test.echo",
      { text: "hello" },
      { callId: "vercel-call-xyz" },
    );
  });

  it("execute threads the per-turn signal into registry.dispatch when getSignal is provided", async () => {
    const { toVercelTools } = await import("../direct/tool-conversion.js");

    const ac = new AbortController();
    let currentSignal: AbortSignal | undefined = ac.signal;
    const getSignal = (): AbortSignal | undefined => currentSignal;

    let observedSignal: AbortSignal | undefined;
    const dispatchMock = vi.fn(
      async (
        _name: string,
        _args: unknown,
        meta: { callId?: string; signal?: AbortSignal },
      ): Promise<ToolResult> => {
        observedSignal = meta.signal;
        return { ok: true, value: { ok: true }, tier: "deterministic" };
      },
    );

    const registry: ToolRegistry = {
      list: () => [
        {
          name: "test.echo",
          description: "Echo",
          inputSchemaJson: { type: "object", properties: {}, additionalProperties: true },
          tier: "deterministic",
        },
      ],
      dispatch: dispatchMock,
    };

    const vercelTools = toVercelTools(registry, getSignal);
    const echoTool = vercelTools["test.echo"];
    expect(echoTool).toBeDefined();
    if (!echoTool) return;

    // biome-ignore lint/suspicious/noExplicitAny: accessing execute on Vercel tool type
    const execute = (echoTool as any).execute as (
      input: unknown,
      opts: { toolCallId: string },
    ) => Promise<unknown>;

    // With a live signal in the getter: signal should be threaded in.
    await execute({}, { toolCallId: "call-1" });
    expect(observedSignal).toBe(ac.signal);

    // When getter returns undefined (simulating send() finally clearing it):
    currentSignal = undefined;
    await execute({}, { toolCallId: "call-2" });
    expect(observedSignal).toBeUndefined();
  });

  it("execute threads the per-turn trace into registry.dispatch when getTrace is provided", async () => {
    const { toVercelTools } = await import("../direct/tool-conversion.js");

    const trace = {
      runId: "run-1",
      sessionId: "session-1" as import("@praxis/core/types").SessionId,
      turnId: "session-1:turn:0",
      turnIndex: 0,
    };
    let currentTrace: typeof trace | undefined = trace;
    const getTrace = (): typeof trace | undefined => currentTrace;

    let observedTrace: typeof trace | undefined;
    const dispatchMock = vi.fn(
      async (
        _name: string,
        _args: unknown,
        meta: { callId?: string; trace?: typeof trace },
      ): Promise<ToolResult> => {
        observedTrace = meta.trace;
        return { ok: true, value: { ok: true }, tier: "deterministic" };
      },
    );

    const registry: ToolRegistry = {
      list: () => [
        {
          name: "test.echo",
          description: "Echo",
          inputSchemaJson: { type: "object", properties: {}, additionalProperties: true },
          tier: "deterministic",
        },
      ],
      dispatch: dispatchMock,
    };

    const vercelTools = toVercelTools(registry, undefined, getTrace);
    const echoTool = vercelTools["test.echo"];
    expect(echoTool).toBeDefined();
    if (!echoTool) return;

    // biome-ignore lint/suspicious/noExplicitAny: accessing execute on Vercel tool type
    const execute = (echoTool as any).execute as (
      input: unknown,
      opts: { toolCallId: string },
    ) => Promise<unknown>;

    await execute({}, { toolCallId: "call-1" });
    expect(observedTrace).toBe(trace);

    currentTrace = undefined;
    await execute({}, { toolCallId: "call-2" });
    expect(observedTrace).toBeUndefined();
  });
});
