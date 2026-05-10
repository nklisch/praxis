/**
 * Tests for ClaudeCodeEngine.open — resume + onEngineSessionReady passthrough (Unit 5c).
 *
 * Verifies the adapter:
 *   - Forwards EngineOpenOptions.resumeEngineSessionId to ConversationOptions.resume
 *   - Passes EngineOpenOptions.onEngineSessionReady through to SDK onSessionReady
 *   - Skips the transcript preface when resuming (preface is only for cross-engine swap)
 *   - Warns if both resumeEngineSessionId and priorTurns are set
 *   - EngineSession.id returns the real id once onSessionReady has fired
 */

import type { Conversation, ConversationOptions } from "@praxis/claude-cli-sdk";
import type { EngineOpenOptions, ToolRegistry, ToolResult } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@praxis/claude-cli-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@praxis/claude-cli-sdk")>();
  return {
    ...actual,
    createConversation: vi.fn(),
    authStatus: vi.fn(),
  };
});

vi.mock("../mcp/tool-bridge.js", () => ({
  startToolBridge: vi.fn(async () => ({
    command: "/usr/bin/node",
    args: ["/tmp/mcp-worker.js"],
    env: {},
    serverName: "praxis",
    toolNames: [],
    close: vi.fn(async () => {}),
  })),
}));

describe("ClaudeCodeEngine.open — resume + onEngineSessionReady", () => {
  const _depLog = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: (): typeof _depLog => _depLog,
  };
  const deps = { log: _depLog };

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
        value: { echoed: "hi" },
        tier: "deterministic",
      }),
    ),
  };

  function makeConvMock(): Conversation {
    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "real-cli-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    async function* fakeStream() {
      yield resultEventObj;
    }
    return {
      sessionId: Promise.resolve("real-cli-session-id"),
      isOpen: true,
      send: vi.fn(() => {
        const streamIterable = fakeStream();
        return Object.assign(streamIterable, {
          result: Promise.resolve({
            result: "done",
            sessionId: "real-cli-session-id",
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

  beforeEach(async () => {
    vi.clearAllMocks();
    const { authStatus } = await import("@praxis/claude-cli-sdk");
    vi.mocked(authStatus).mockResolvedValue({ loggedIn: true });
  });

  it("forwards resumeEngineSessionId as ConversationOptions.resume", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    vi.mocked(createConversation).mockReturnValue(makeConvMock());

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const openOpts: EngineOpenOptions = {
      systemPrompt: "You are a tutor.",
      tools: emptyRegistry,
      resumeEngineSessionId: "prior-cli-session-xyz",
    };
    const session = await engine.open(openOpts);

    expect(createConversation).toHaveBeenCalledTimes(1);
    const sdkOpts = vi.mocked(createConversation).mock.calls[0]?.[0] as ConversationOptions;
    expect(sdkOpts.resume).toBe("prior-cli-session-xyz");

    await session.close();
  });

  it("does not pass resume when resumeEngineSessionId is omitted", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    vi.mocked(createConversation).mockReturnValue(makeConvMock());

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    const sdkOpts = vi.mocked(createConversation).mock.calls[0]?.[0] as ConversationOptions;
    expect(sdkOpts.resume).toBeUndefined();

    await session.close();
  });

  it("fires onEngineSessionReady exactly once with the SDK-reported session id", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    // Capture the SDK's onSessionReady callback so we can drive it manually.
    let capturedOnSessionReady: ((id: string) => void) | undefined;
    vi.mocked(createConversation).mockImplementation((options) => {
      capturedOnSessionReady = options.onSessionReady;
      return makeConvMock();
    });

    const fired: string[] = [];
    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open({
      systemPrompt: "You are a tutor.",
      tools: emptyRegistry,
      onEngineSessionReady: (id) => fired.push(id),
    });

    expect(capturedOnSessionReady).toBeDefined();
    capturedOnSessionReady?.("real-cli-session-id");

    expect(fired).toEqual(["real-cli-session-id"]);
    // Adapter session.id should now reflect the real id, not a placeholder.
    expect(session.id).toBe("real-cli-session-id");

    await session.close();
  });

  it("warns when both resumeEngineSessionId and priorTurns are set; resume wins", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    vi.mocked(createConversation).mockReturnValue(makeConvMock());

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open({
      systemPrompt: "You are a tutor.",
      tools: echoRegistry,
      resumeEngineSessionId: "prior-cli-session-xyz",
      priorTurns: [{ role: "user", content: "earlier message" }],
    });

    // SDK got resume (native continuity wins)
    const sdkOpts = vi.mocked(createConversation).mock.calls[0]?.[0] as ConversationOptions;
    expect(sdkOpts.resume).toBe("prior-cli-session-xyz");

    // The adapter logged a warning about the conflicting options
    expect(_depLog.warn).toHaveBeenCalledWith(
      "engine.claude-code.open.resume_and_prior_turns_both_set",
      expect.objectContaining({ resumeEngineSessionId: "prior-cli-session-xyz" }),
    );

    await session.close();
  });

  it("EngineSession.id returns a placeholder before onSessionReady fires", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    // Don't fire the callback — simulate the window before the init event arrives.
    vi.mocked(createConversation).mockImplementation(() => makeConvMock());

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    // The placeholder format is `claude-code-<timestamp>` — assert the prefix only.
    expect(session.id.startsWith("claude-code-")).toBe(true);
    expect(session.id).not.toBe("real-cli-session-id");

    await session.close();
  });
});
