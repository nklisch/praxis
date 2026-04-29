import type { ToolRegistry, ToolResult } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @openai/codex-sdk
vi.mock("@openai/codex-sdk", () => {
  const Codex = vi.fn();
  return { Codex };
});

// Mock MCP bridge
vi.mock("../mcp/tool-bridge.js", () => ({
  startToolBridge: vi.fn(async () => ({
    command: "/usr/bin/node",
    args: ["/tmp/mcp-worker.js"],
    env: {},
    serverName: "praxis",
    toolNames: ["test.echo"],
    close: vi.fn(async () => {}),
  })),
}));

describe("CodexEngine — lifecycle", () => {
  const deps = {
    log: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
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

  it("id and kind are correct", async () => {
    const { CodexEngine } = await import("../codex/adapter.js");
    const engine = new CodexEngine({ config: { engineId: "codex" }, deps });
    expect(engine.id).toBe("codex");
    expect(engine.kind).toBe("looped");
  });

  it("open() returns a session with a non-empty id", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexEngine } = await import("../codex/adapter.js");

    async function* emptyEvents() {
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 0,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
        },
      };
    }

    vi.mocked(Codex).mockImplementation(
      () =>
        ({
          startThread: vi.fn(() => ({
            runStreamed: vi.fn(async () => ({ events: emptyEvents() })),
            run: vi.fn(),
            id: null,
          })),
          resumeThread: vi.fn(),
        }) as unknown as import("@openai/codex-sdk").Codex,
    );

    const engine = new CodexEngine({ config: { engineId: "codex" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    expect(session.id).toBeTruthy();
    await session.close();
  });

  it("two sends on the same session call runStreamed twice (startThread called once)", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexEngine } = await import("../codex/adapter.js");

    async function* emptyEvents() {
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 0,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
        },
      };
    }

    const runStreamedSpy = vi.fn(async () => ({ events: emptyEvents() }));
    const startThreadSpy = vi.fn(() => ({
      runStreamed: runStreamedSpy,
      run: vi.fn(),
      id: null,
    }));

    vi.mocked(Codex).mockImplementation(
      () =>
        ({
          startThread: startThreadSpy,
          resumeThread: vi.fn(),
        }) as unknown as import("@openai/codex-sdk").Codex,
    );

    const engine = new CodexEngine({ config: { engineId: "codex" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    for await (const _ of session.send("first")) {
      /* drain */
    }
    for await (const _ of session.send("second")) {
      /* drain */
    }

    // startThread called once; runStreamed called twice
    expect(startThreadSpy).toHaveBeenCalledTimes(1);
    expect(runStreamedSpy).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it("close() tears down bridge; idempotent", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { CodexEngine } = await import("../codex/adapter.js");

    const echoRegistry: ToolRegistry = {
      list: () => [
        {
          name: "test.echo",
          description: "Echo",
          inputSchemaJson: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
          tier: "deterministic",
        },
      ],
      dispatch: vi.fn(
        async (): Promise<ToolResult> => ({ ok: true as const, value: {}, tier: "deterministic" }),
      ),
    };

    async function* emptyEvents() {
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 0,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
        },
      };
    }

    vi.mocked(Codex).mockImplementation(
      () =>
        ({
          startThread: vi.fn(() => ({
            runStreamed: vi.fn(async () => ({ events: emptyEvents() })),
            run: vi.fn(),
            id: null,
          })),
          resumeThread: vi.fn(),
        }) as unknown as import("@openai/codex-sdk").Codex,
    );

    const engine = new CodexEngine({ config: { engineId: "codex" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: echoRegistry });
    await session.close();
    await session.close(); // idempotent

    const bridgeHandle = await vi.mocked(startToolBridge).mock.results[0]?.value;
    expect(bridgeHandle.close).toHaveBeenCalledTimes(1);
  });

  it("send to closed session yields error event", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexEngine } = await import("../codex/adapter.js");

    async function* emptyEvents() {
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 0,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
        },
      };
    }

    vi.mocked(Codex).mockImplementation(
      () =>
        ({
          startThread: vi.fn(() => ({
            runStreamed: vi.fn(async () => ({ events: emptyEvents() })),
            run: vi.fn(),
            id: null,
          })),
          resumeThread: vi.fn(),
        }) as unknown as import("@openai/codex-sdk").Codex,
    );

    const engine = new CodexEngine({ config: { engineId: "codex" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    await session.close();

    const events = [];
    for await (const event of session.send("Hello after close")) {
      events.push(event);
    }
    expect(events[0]).toMatchObject({ type: "error", error: { code: "session.closed" } });
  });

  it("agent_message item emits model_message event", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexEngine } = await import("../codex/adapter.js");

    async function* fakeEvents() {
      yield { type: "thread.started", thread_id: "th-1" };
      yield { type: "turn.started" };
      yield {
        type: "item.completed",
        item: { id: "i-1", type: "agent_message", text: "Calling echo...done" },
      };
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 5,
          cached_input_tokens: 0,
          output_tokens: 10,
          reasoning_output_tokens: 0,
        },
      };
    }

    vi.mocked(Codex).mockImplementation(
      () =>
        ({
          startThread: vi.fn(
            () =>
              ({
                runStreamed: vi.fn(async () => ({ events: fakeEvents() })),
                run: vi.fn(),
                id: null,
              }) as unknown as import("@openai/codex-sdk").Thread,
          ),
          resumeThread: vi.fn(),
        }) as unknown as import("@openai/codex-sdk").Codex,
    );

    const engine = new CodexEngine({ config: { engineId: "codex" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    const events = [];
    for await (const event of session.send("Hello")) {
      events.push(event);
    }
    await session.close();

    const modelMsg = events.find((e) => e.type === "model_message");
    expect(modelMsg).toBeDefined();
    if (modelMsg?.type === "model_message") {
      expect(modelMsg.content).toBe("Calling echo...done");
      expect(modelMsg.partial).toBe(false);
    }

    const finalEvent = events.find((e) => e.type === "final");
    expect(finalEvent).toBeDefined();
    if (finalEvent?.type === "final") {
      expect(finalEvent.usage.inputTokens).toBe(5);
      expect(finalEvent.usage.outputTokens).toBe(10);
    }
  });

  it("mcp_tool_call from praxis server emits tool_call + tool_result", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexEngine } = await import("../codex/adapter.js");

    async function* fakeEvents() {
      yield { type: "turn.started" };
      yield {
        type: "item.completed",
        item: {
          id: "i-1",
          type: "mcp_tool_call",
          server: "praxis",
          tool: "test.echo",
          arguments: { text: "hello" },
          result: { content: [], structured_content: { echoed: "hello" } },
          status: "completed",
        },
      };
      yield {
        type: "item.completed",
        item: { id: "i-2", type: "agent_message", text: "...done" },
      };
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 5,
          cached_input_tokens: 0,
          output_tokens: 10,
          reasoning_output_tokens: 0,
        },
      };
    }

    vi.mocked(Codex).mockImplementation(
      () =>
        ({
          startThread: vi.fn(
            () =>
              ({
                runStreamed: vi.fn(async () => ({ events: fakeEvents() })),
                run: vi.fn(),
                id: null,
              }) as unknown as import("@openai/codex-sdk").Thread,
          ),
          resumeThread: vi.fn(),
        }) as unknown as import("@openai/codex-sdk").Codex,
    );

    const engine = new CodexEngine({ config: { engineId: "codex" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    const events = [];
    for await (const event of session.send("Hello")) {
      events.push(event);
    }
    await session.close();

    const toolCall = events.find((e) => e.type === "tool_call");
    expect(toolCall).toBeDefined();
    if (toolCall?.type === "tool_call") {
      expect(toolCall.toolName).toBe("test.echo");
      expect(toolCall.args).toEqual({ text: "hello" });
    }

    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult).toBeDefined();
    if (toolResult?.type === "tool_result") {
      expect(toolResult.result.ok).toBe(true);
    }
  });

  it("mcp_tool_call from non-praxis server emits no events", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexEngine } = await import("../codex/adapter.js");

    async function* fakeEvents() {
      yield {
        type: "item.completed",
        item: {
          id: "i-1",
          type: "mcp_tool_call",
          server: "other-server",
          tool: "some-tool",
          arguments: {},
          status: "completed",
        },
      };
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 0,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
        },
      };
    }

    vi.mocked(Codex).mockImplementation(
      () =>
        ({
          startThread: vi.fn(
            () =>
              ({
                runStreamed: vi.fn(async () => ({ events: fakeEvents() })),
                run: vi.fn(),
                id: null,
              }) as unknown as import("@openai/codex-sdk").Thread,
          ),
          resumeThread: vi.fn(),
        }) as unknown as import("@openai/codex-sdk").Codex,
    );

    const engine = new CodexEngine({ config: { engineId: "codex" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    const events = [];
    for await (const event of session.send("Hello")) {
      events.push(event);
    }
    await session.close();

    const toolCall = events.find((e) => e.type === "tool_call");
    expect(toolCall).toBeUndefined();
  });

  it("turn.completed emits final event", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexEngine } = await import("../codex/adapter.js");

    async function* fakeEvents() {
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 15,
          cached_input_tokens: 5,
          output_tokens: 25,
          reasoning_output_tokens: 0,
        },
      };
    }

    vi.mocked(Codex).mockImplementation(
      () =>
        ({
          startThread: vi.fn(
            () =>
              ({
                runStreamed: vi.fn(async () => ({ events: fakeEvents() })),
                run: vi.fn(),
                id: null,
              }) as unknown as import("@openai/codex-sdk").Thread,
          ),
          resumeThread: vi.fn(),
        }) as unknown as import("@openai/codex-sdk").Codex,
    );

    const engine = new CodexEngine({ config: { engineId: "codex" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    const events = [];
    for await (const event of session.send("Hello")) {
      events.push(event);
    }
    await session.close();

    const finalEvent = events.find((e) => e.type === "final");
    expect(finalEvent).toBeDefined();
    if (finalEvent?.type === "final") {
      expect(finalEvent.usage.inputTokens).toBe(15);
      expect(finalEvent.usage.outputTokens).toBe(25);
    }
  });
});
