import type { ToolDefinitionSummary, ToolRegistry, ToolResult } from "@praxis/core/types";
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

describe("DirectEngine", () => {
  const deps = {
    log: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  const brief = {
    systemPrompt: "You are a tutor.",
    userMessage: "Hello",
    context: { retrievedChunks: [], artifactRefs: [] },
  };

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

    const events = [];
    for await (const event of engine.run(brief, emptyRegistry)) {
      events.push(event);
    }

    // Should have: text-delta (partial), text-end (full), tool-call, tool-result, text-delta (partial), text-end (full), finish
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

    const events = [];
    for await (const event of engine.run(brief, emptyRegistry)) {
      events.push(event);
    }

    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult).toBeDefined();
    if (toolResult?.type === "tool_result") {
      expect(toolResult.result.ok).toBe(false);
    }
  });

  it("tool dispatch routes through registry.dispatch", async () => {
    const { streamText } = await import("ai");
    const { DirectEngine } = await import("../direct/adapter.js");

    // We check the tool wrapping indirectly via the tool conversion layer
    // The streamText mock receives a `tools` argument with wrapped registry dispatchers
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
    for await (const _ of engine.run(brief, registry)) {
      /* drain */
    }

    // The tool execute function in the tools record should call registry.dispatch
    const echoCaptured = capturedTools["test.echo"] as {
      execute?: (args: unknown) => Promise<unknown>;
    };
    if (echoCaptured?.execute) {
      await echoCaptured.execute({ text: "hello" });
      expect(dispatchSpy).toHaveBeenCalledWith("test.echo", { text: "hello" });
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
});
