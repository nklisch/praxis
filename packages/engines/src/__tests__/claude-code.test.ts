import type { Conversation } from "@praxis/claude-cli-sdk";
import type { EngineOpenOptions, ToolRegistry, ToolResult } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @praxis/claude-cli-sdk at the top level (hoisted).
// Use importOriginal so error classes (CLINotFoundError) are real, only
// createConversation and authStatus are replaced with mocks.
vi.mock("@praxis/claude-cli-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@praxis/claude-cli-sdk")>();
  return {
    ...actual,
    createConversation: vi.fn(),
    authStatus: vi.fn(),
  };
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

describe("ClaudeCodeEngine — lifecycle", () => {
  const _depLog = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
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
        value: { echoed: "hello" },
        tier: "deterministic",
      }),
    ),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default: auth passes. Tests that need failure override this.
    const { authStatus } = await import("@praxis/claude-cli-sdk");
    vi.mocked(authStatus).mockResolvedValue({ loggedIn: true });
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

  it("open() returns a session with a non-empty id", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    expect(session.id).toBeTruthy();
    await session.close();
  });

  // Regression: the tutor model used to call Claude Code's built-in
  // AskUserQuestion (and could reach for Bash/Read/Edit/etc. too). The CLI
  // subprocess has no TTY and Praxis doesn't register toolHandlers, so those
  // calls error and the UI renders "Couldn't finish askuserquestion." Lock
  // the contract: only first-party MCP tools are exposed to the tutor.
  it("open() passes tools: 'none' to createConversation so built-ins (AskUserQuestion, Bash, …) stay hidden from the model", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: echoRegistry });

    expect(vi.mocked(createConversation)).toHaveBeenCalledTimes(1);
    const sdkOpts = vi.mocked(createConversation).mock.calls[0]?.[0];
    expect(sdkOpts?.tools).toBe("none");

    await session.close();
  });

  // Regression: the SDK has a per-turn wall-clock timeout (10 min default)
  // that kills the subprocess with SIGTERM when a turn takes too long. The
  // drafter reads large textbook bundles and regularly exceeds this.
  // Praxis disables the wall-clock timer by passing timeout:0 and instead bounds
  // turns via maxSteps + AbortSignal. If this assertion fails, long-running
  // turns (especially course-create) will produce opaque CLITimeoutErrors.
  it("open() passes timeout:0 to createConversation to disable the SDK wall-clock kill", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    expect(vi.mocked(createConversation)).toHaveBeenCalledTimes(1);
    const sdkOpts = vi.mocked(createConversation).mock.calls[0]?.[0];
    expect(sdkOpts?.timeout).toBe(0);

    await session.close();
  });

  it("two sends on the same session call conv.send twice (createConversation called once)", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    const convMock = makeConvMock([resultEventObj], resultEventObj);
    vi.mocked(createConversation).mockReturnValue(convMock);

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    for await (const _ of session.send("first")) {
      /* drain */
    }
    for await (const _ of session.send("second")) {
      /* drain */
    }

    // createConversation called only once; conv.send called twice
    expect(vi.mocked(createConversation)).toHaveBeenCalledTimes(1);
    expect(convMock.send).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it("close() calls conv.close and bridge.close; idempotent", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    const closeMock = vi.fn(async () => {});
    const convMock = makeConvMock([resultEventObj], resultEventObj);
    (convMock as unknown as { close: typeof closeMock }).close = closeMock;
    vi.mocked(createConversation).mockReturnValue(convMock);

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    // Use echoRegistry to trigger bridge creation
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: echoRegistry });
    await session.close();
    await session.close(); // idempotent

    expect(closeMock).toHaveBeenCalledTimes(1);
    const bridgeHandle = await vi.mocked(startToolBridge).mock.results[0]?.value;
    expect(bridgeHandle.close).toHaveBeenCalledTimes(1);
  });

  it("emits events from canned stream", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    const events = [];
    for await (const event of session.send("Hello")) {
      events.push(event);
    }
    await session.close();

    const types = events.map((e) => e.type);
    expect(types).toContain("model_message");
    expect(types).toContain("final");
  });

  it("callId counter persists across send() calls in the same session", async () => {
    // Regression: the MCP bridge worker spawns once per Conversation and its
    // callCounter persists across all turns. The Claude Code adapter mirrors
    // that counter via a per-session event state. If the adapter accidentally
    // reset the state per send(), the second send's tool_use events would
    // carry callId "1" again while the bridge worker would emit "3" — the
    // sub-agent UI subscription would no longer match the registry's stored
    // parentCallId.
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };

    // Queue distinct stream events per send. Each send emits one tool_use.
    const streamQueue: unknown[][] = [
      [
        { type: "tool_use", toolName: "mcp__praxis__t1", toolId: "toolu_AAA", toolInput: {} },
        resultEventObj,
      ],
      [
        { type: "tool_use", toolName: "mcp__praxis__t2", toolId: "toolu_BBB", toolInput: {} },
        resultEventObj,
      ],
    ];

    const convMock = {
      sessionId: Promise.resolve("test-session-id"),
      isOpen: true,
      send: vi.fn(() => {
        const events = streamQueue.shift() ?? [resultEventObj];
        async function* fakeStream() {
          for (const e of events) yield e;
        }
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
    vi.mocked(createConversation).mockReturnValue(convMock);

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    const firstSendCallIds: string[] = [];
    for await (const event of session.send("first")) {
      if (event.type === "tool_call") firstSendCallIds.push(event.callId);
    }
    const secondSendCallIds: string[] = [];
    for await (const event of session.send("second")) {
      if (event.type === "tool_call") secondSendCallIds.push(event.callId);
    }
    await session.close();

    // First send: tool_use_id "toolu_AAA" → callId "1"
    expect(firstSendCallIds).toEqual(["1"]);
    // Second send must continue from "2", NOT reset to "1" — that's the bug
    // this test guards against.
    expect(secondSendCallIds).toEqual(["2"]);
  });

  it("strips MCP prefix from tool_use event toolName", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: echoRegistry });
    const events = [];
    for await (const event of session.send("Hello")) {
      events.push(event);
    }
    await session.close();

    const toolCall = events.find((e) => e.type === "tool_call");
    expect(toolCall).toBeDefined();
    if (toolCall?.type === "tool_call") {
      expect(toolCall.toolName).toBe("test.echo");
    }
  });

  it("bridge is NOT started when tools.list() is empty", async () => {
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    for await (const _ of session.send("Hello")) {
      /* drain */
    }
    await session.close();

    expect(vi.mocked(startToolBridge)).not.toHaveBeenCalled();
  });

  it("seedPreface only applied on first send after priorTurns open", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };

    const sendSpy = vi.fn(() => {
      const stream = (async function* () {
        yield resultEventObj;
      })();
      return Object.assign(stream, {
        result: Promise.resolve({
          result: "done",
          sessionId: "test-session-id",
          resultEvent: resultEventObj,
        }),
      });
    });

    vi.mocked(createConversation).mockReturnValue({
      sessionId: Promise.resolve("test-session-id"),
      isOpen: true,
      send: sendSpy,
      sendAndCollect: vi.fn(),
      sendToolResult: vi.fn(),
      close: vi.fn(async () => {}),
      abort: vi.fn(() => {}),
      [Symbol.asyncDispose]: vi.fn(async () => {}),
    } as unknown as Conversation);

    const openOpts: EngineOpenOptions = {
      systemPrompt: "You are a tutor.",
      tools: emptyRegistry,
      priorTurns: [
        { role: "user", content: "earlier question" },
        { role: "assistant", content: "earlier answer" },
      ],
    };

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open(openOpts);

    // First send — should include transcript preface
    for await (const _ of session.send("new question")) {
      /* drain */
    }
    // biome-ignore lint/suspicious/noExplicitAny: test spy access with noUncheckedIndexedAccess
    const firstCall = (sendSpy.mock.calls as any)[0][0] as string;
    expect(firstCall).toContain("[Continuing this conversation from earlier:]");
    expect(firstCall).toContain("new question");

    // Second send — should NOT include preface
    for await (const _ of session.send("follow-up")) {
      /* drain */
    }
    // biome-ignore lint/suspicious/noExplicitAny: test spy access with noUncheckedIndexedAccess
    const secondCall = (sendSpy.mock.calls as any)[1][0] as string;
    expect(secondCall).toBe("follow-up");

    await session.close();
  });

  // ── Unit 3: Auth precheck ─────────────────────────────────────────────────

  it("open() proceeds normally when authStatus returns loggedIn: true", async () => {
    const { authStatus, createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    vi.mocked(authStatus).mockResolvedValue({ loggedIn: true });

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    vi.mocked(createConversation).mockReturnValue(makeConvMock([resultEventObj], resultEventObj));

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    expect(session.id).toBeTruthy();
    await session.close();
  });

  it("open() throws 'claude.auth.required:' when authStatus returns loggedIn: false", async () => {
    const { authStatus } = await import("@praxis/claude-cli-sdk");
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    vi.mocked(authStatus).mockResolvedValue({
      loggedIn: false,
      error: "Not authenticated",
    });

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    await expect(
      engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry }),
    ).rejects.toThrow(/^claude\.auth\.required:/);

    // Tool bridge must never be spawned
    expect(vi.mocked(startToolBridge)).not.toHaveBeenCalled();
  });

  it("open() error message includes the error field from authStatus", async () => {
    const { authStatus } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    vi.mocked(authStatus).mockResolvedValue({
      loggedIn: false,
      error: "Session expired",
    });

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    await expect(
      engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry }),
    ).rejects.toThrow("claude.auth.required: Session expired");
  });

  it("open() uses fallback message when authStatus returns loggedIn: false with no error", async () => {
    const { authStatus } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    vi.mocked(authStatus).mockResolvedValue({ loggedIn: false });

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    await expect(
      engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry }),
    ).rejects.toThrow("claude.auth.required: claude CLI is not signed in");
  });

  it("open() propagates CLINotFoundError unchanged when authStatus throws", async () => {
    const { authStatus } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");
    const { CLINotFoundError } = await import("@praxis/claude-cli-sdk");

    const notFound = new CLINotFoundError();
    vi.mocked(authStatus).mockRejectedValue(notFound);

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    await expect(
      engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry }),
    ).rejects.toThrow(CLINotFoundError);
  });

  it("send to closed session yields error event", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });
    await session.close();

    const events = [];
    for await (const event of session.send("Hello after close")) {
      events.push(event);
    }
    expect(events[0]).toMatchObject({ type: "error", error: { code: "session.closed" } });
  });

  // ── AbortSignal → conv.abort() ─────────────────────────────────────────────

  it("calls conv.abort() when the AbortSignal fires mid-turn", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const abortMock = vi.fn(() => {});
    const controller = new AbortController();

    // Build a conv mock whose send() yields a couple of events then waits.
    // We'll abort the controller after the first event is consumed.
    let resolveStream!: () => void;
    const streamBlocked = new Promise<void>((res) => {
      resolveStream = res;
    });

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };

    async function* blockingStream() {
      yield { type: "assistant", text: "Thinking...", delta: "Thinking..." };
      // Park here until the test tells us to proceed (or abort fires).
      await streamBlocked;
      yield resultEventObj;
    }

    const convMock = {
      sessionId: Promise.resolve("test-session-id"),
      isOpen: true,
      send: vi.fn(() => {
        const iter = blockingStream();
        return Object.assign(iter, { result: Promise.resolve({ result: "done" }) });
      }),
      sendAndCollect: vi.fn(),
      sendToolResult: vi.fn(),
      close: vi.fn(async () => {}),
      abort: abortMock,
      [Symbol.asyncDispose]: vi.fn(async () => {}),
    };

    vi.mocked(createConversation).mockReturnValue(convMock as any);

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    // Collect events in the background; abort after the first one arrives.
    const eventsPromise = (async () => {
      const collected = [];
      for await (const ev of session.send("hello", controller.signal)) {
        collected.push(ev);
        // Abort after first event — triggers the onAbort listener.
        controller.abort();
        // Unblock the stream so it can drain cleanly.
        resolveStream();
      }
      return collected;
    })();

    await eventsPromise;
    await session.close();

    expect(abortMock).toHaveBeenCalledTimes(1);
  });

  it("calls conv.abort() immediately when signal is already aborted before send", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const abortMock = vi.fn(() => {});

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };

    const convMock = makeConvMock([resultEventObj], resultEventObj);
    (convMock as unknown as { abort: typeof abortMock }).abort = abortMock;
    vi.mocked(createConversation).mockReturnValue(convMock);

    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    // Pre-abort the controller before calling send.
    const controller = new AbortController();
    controller.abort();

    for await (const _ of session.send("hello", controller.signal)) {
      /* drain */
    }

    await session.close();

    // conv.abort() must have been called synchronously during send().
    expect(abortMock).toHaveBeenCalledTimes(1);
  });

  // Defense-in-depth: open() without maxSteps must still pass a finite maxTurns
  // to createConversation so that timeout:0 (wall-clock disabled) does not produce
  // an unbounded conversation — see gate-security-sdk-timeout-disabled-defense-in-depth.
  it("open() without maxSteps passes maxTurns: DEFAULT_MAX_TURNS (100) to createConversation", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    // Deliberately omit maxSteps — the adapter must supply the default floor.
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    expect(vi.mocked(createConversation)).toHaveBeenCalledTimes(1);
    const sdkOpts = vi.mocked(createConversation).mock.calls[0]?.[0];
    expect(sdkOpts?.maxTurns).toBe(100);

    await session.close();
  });

  it("open() with maxSteps passes that value as maxTurns to createConversation", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    const session = await engine.open({
      systemPrompt: "You are a tutor.",
      tools: emptyRegistry,
      maxSteps: 30,
    });

    expect(vi.mocked(createConversation)).toHaveBeenCalledTimes(1);
    const sdkOpts = vi.mocked(createConversation).mock.calls[0]?.[0];
    expect(sdkOpts?.maxTurns).toBe(30);

    await session.close();
  });

  // Security regression: Praxis-spawned CLI subprocess was inheriting the
  // user's personal MCP servers from ~/.claude/settings.json even when Praxis
  // passed --tools "" and --mcp-config pointing only at first-party tools.
  // Symptom: krometrail MCP server (user's personal server) appeared as a child
  // of the course-create drafter via pstree. The user did NOT consent to giving
  // Praxis agents access to their personal MCP tooling.
  //
  // Fix: pass strictMcpConfig: true so the CLI honors --strict-mcp-config,
  // which instructs it to ONLY load MCP servers from our explicit --mcp-config
  // and ignore all other MCP configurations (including user-level settings).
  it("open() passes strictMcpConfig: true to prevent the CLI from loading user-level MCP servers", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
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
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: echoRegistry });

    expect(vi.mocked(createConversation)).toHaveBeenCalledTimes(1);
    const sdkOpts = vi.mocked(createConversation).mock.calls[0]?.[0];
    // Must be true so --strict-mcp-config is emitted by the SDK.
    expect(sdkOpts?.strictMcpConfig).toBe(true);

    await session.close();
  });

  // Crash-survival cleanup: the adapter threads PID callbacks through to
  // createConversation so the desktop layer can register/deregister CLI
  // subprocess PIDs in the orphan-sweep registry.
  it("open() threads onProcessSpawned and onProcessExited callbacks to createConversation", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");
    const { ClaudeCodeEngine } = await import("../claude-code/adapter.js");

    const resultEventObj = {
      type: "result",
      subtype: "success",
      sessionId: "test-session-id",
      result: "done",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    vi.mocked(createConversation).mockReturnValue(makeConvMock([resultEventObj], resultEventObj));

    const onProcessSpawned = vi.fn();
    const onProcessExited = vi.fn();

    const engine = new ClaudeCodeEngine({
      config: { engineId: "claude-code" },
      deps,
      onProcessSpawned,
      onProcessExited,
    });
    const session = await engine.open({ systemPrompt: "You are a tutor.", tools: emptyRegistry });

    expect(vi.mocked(createConversation)).toHaveBeenCalledTimes(1);
    const sdkOpts = vi.mocked(createConversation).mock.calls[0]?.[0];
    // Callbacks must be present so the conversation layer can fire them on
    // spawn and exit — the registry wires actual register/deregister to them.
    expect(typeof sdkOpts?.onProcessSpawned).toBe("function");
    expect(typeof sdkOpts?.onProcessExited).toBe("function");

    await session.close();
  });
});
