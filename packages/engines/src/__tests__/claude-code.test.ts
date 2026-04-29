import type { Conversation } from "@nklisch/claude-cli-sdk";
import type { ToolRegistry, ToolResult } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @nklisch/claude-cli-sdk at the top level (hoisted)
vi.mock("@nklisch/claude-cli-sdk", () => {
  const createConversation = vi.fn();
  return { createConversation };
});

// Also mock the MCP bridge so no subprocess is spawned
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

describe("ClaudeCodeEngine", () => {
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

  const emptyRegistry: ToolRegistry = {
    list: () => [],
    dispatch: vi.fn(
      async (): Promise<ToolResult> => ({
        ok: false,
        error: { code: "tool.not_found", message: "no tools", recoverable: false },
      }),
    ),
  };

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
      async (): Promise<ToolResult> => ({
        ok: true,
        value: { echoed: "hello" },
        tier: "deterministic",
      }),
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeConvMock(streamEvents: unknown[], resultEventObj: unknown): Conversation {
    async function* fakeStream() {
      for (const e of streamEvents) {
        yield e;
      }
    }

    return {
      sessionId: Promise.resolve("test-session-id"),
      isOpen: true,
      send: vi.fn(() => {
        const streamIterable = fakeStream();
        return Object.assign(streamIterable, {
          result: Promise.resolve({
            result: "done",
            sessionId: "test-session-id",
            resultEvent: resultEventObj,
          }),
        });
      }),
      sendAndCollect: vi.fn(),
      sendToolResult: vi.fn(),
      close: vi.fn(async () => {}),
      abort: vi.fn(() => {}),
      [Symbol.asyncDispose]: vi.fn(async () => {}),
    } as unknown as Conversation;
  }

  it("id and kind are correct", async () => {
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");
    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    expect(engine.id).toBe("claude-code");
    expect(engine.kind).toBe("looped");
  });

  it("emits events from canned stream", async () => {
    const { createConversation } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 5, outputTokens: 10 },
    };

    vi.mocked(createConversation).mockReturnValue(
      makeConvMock(
        [
          { type: "system", subtype: "init", sessionId: "test-session-id" },
          { type: "assistant", text: "Calling echo...", delta: "Calling echo..." },
          {
            type: "tool_use",
            toolName: "mcp__praxis__test.echo",
            toolId: "tu-1",
            toolInput: { text: "hello" },
          },
          {
            type: "tool_result",
            toolId: "tu-1",
            content: JSON.stringify({ echoed: "hello" }),
            isError: false,
          },
          { type: "assistant", text: "...done", delta: "...done" },
          resultEventObj,
        ],
        resultEventObj,
      ),
    );

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const events = [];
    for await (const event of engine.run(brief, emptyRegistry)) {
      events.push(event);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain("model_message");
    expect(types).toContain("final");
  });

  it("strips MCP prefix from tool_use event toolName", async () => {
    const { createConversation } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 5, outputTokens: 10 },
    };

    vi.mocked(createConversation).mockReturnValue(
      makeConvMock(
        [
          {
            type: "tool_use",
            toolName: "mcp__praxis__test.echo",
            toolId: "tu-1",
            toolInput: { text: "hello" },
          },
          resultEventObj,
        ],
        resultEventObj,
      ),
    );

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const events = [];
    for await (const event of engine.run(brief, echoRegistry)) {
      events.push(event);
    }

    const toolCall = events.find((e) => e.type === "tool_call");
    expect(toolCall).toBeDefined();
    if (toolCall?.type === "tool_call") {
      expect(toolCall.toolName).toBe("test.echo");
    }
  });

  it("bridge is NOT started when tools.list() is empty", async () => {
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { createConversation } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };

    vi.mocked(createConversation).mockReturnValue(makeConvMock([resultEventObj], resultEventObj));

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    for await (const _ of engine.run(brief, emptyRegistry)) {
      /* drain */
    }

    expect(vi.mocked(startToolBridge)).not.toHaveBeenCalled();
  });

  it("close() called even when stream throws", async () => {
    const { createConversation } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const closeMock = vi.fn(async () => {});

    async function* throwingStream() {
      yield { type: "assistant", text: "starting...", delta: "starting..." };
      throw new Error("stream error");
    }

    const conv: Conversation = {
      sessionId: Promise.resolve("test-session-id"),
      isOpen: true,
      send: vi.fn(() => {
        const streamIterable = throwingStream();
        return Object.assign(streamIterable, {
          result: Promise.resolve({
            result: "",
            sessionId: "test-session-id",
            resultEvent: null as unknown as import("@nklisch/claude-cli-sdk").ResultEvent,
          }),
        });
      }),
      sendAndCollect: vi.fn(),
      sendToolResult: vi.fn(),
      close: closeMock,
      abort: vi.fn(() => {}),
      [Symbol.asyncDispose]: closeMock,
    } as unknown as Conversation;

    vi.mocked(createConversation).mockReturnValue(conv);

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    await expect(async () => {
      for await (const _ of engine.run(brief, emptyRegistry)) {
        /* drain */
      }
    }).rejects.toThrow("stream error");

    expect(closeMock).toHaveBeenCalled();
  });
});
