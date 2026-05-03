/**
 * Engine conformance suite — all three adapters against the same mocked-SDK scenario
 * produce an equivalent normalized turn: final text contains "done", tool-call
 * sequence matches, and a final event is emitted.
 *
 * Uses runOneShot(engine, opts, userMessage) as the single-turn convenience wrapper
 * (equivalent to old Phase 2 engine.run(brief, tools)).
 *
 * vi.mock calls are hoisted; each adapter's SDK is mocked independently in this file.
 */

import type { EngineEvent, EngineOpenOptions } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { runOneShot } from "@praxis/engines";
import { ClaudeCodeEngine } from "@praxis/engines/claude-code";
import { CodexEngine } from "@praxis/engines/codex";
import { DirectEngine } from "@praxis/engines/direct";
import { InProcessToolRegistry } from "@praxis/tools";
import { echoTool } from "@praxis/tools/test-tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock @praxis/claude-cli-sdk ──────────────────────────────────────────────
// We mock createConversation (for ClaudeCodeAdapter) AND startToolServer
// (used by startToolBridge inside the adapter) to avoid real subprocess spawning.
vi.mock("@praxis/claude-cli-sdk", () => {
  const createConversation = vi.fn();
  // biome-ignore lint/suspicious/noExplicitAny: mock factory needs any
  const tool = vi.fn((name: string, _desc: string, _schema: any, handler: any) => ({
    name,
    handler,
  }));
  const startToolServer = vi.fn(async () => ({
    command: "/usr/bin/node",
    args: ["/tmp/mcp-worker.js"],
    env: { PRAXIS_MCP_SOCKET: "/tmp/mcp.sock" },
    tempDir: "/tmp",
    close: vi.fn(async () => {}),
  }));
  return { createConversation, tool, startToolServer };
});

// ── Mock @openai/codex-sdk ────────────────────────────────────────────────────
vi.mock("@openai/codex-sdk", () => {
  const Codex = vi.fn();
  return { Codex };
});

// ── Mock the `ai` module (for DirectEngine) ───────────────────────────────────
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: vi.fn(),
    stepCountIs: vi.fn((n: number) => ({ stepCountIs: n })),
  };
});

// ── Mock provider SDKs ────────────────────────────────────────────────────────
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

// ── Test helpers ──────────────────────────────────────────────────────────────

const SCENARIO_SYSTEM_PROMPT = "You are a tutor. Be brief.";
const SCENARIO_USER_MESSAGE = "Use the test.echo tool with text 'hello' and then say 'done'.";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
};

function makeToolContext() {
  return {
    studentId: brandId<"StudentId">("stub-student"),
    sessionId: brandId<"SessionId">("stub-session"),
    services: {
      memory: null,
      artifacts: null,
      vectorStore: {
        upsert: vi.fn(),
        upsertBatch: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        deleteByDocumentId: vi.fn(),
      },
      ftsStore: {
        upsert: vi.fn(),
        upsertBatch: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        deleteByDocumentId: vi.fn(),
      },
      embeddings: {
        embed: vi.fn().mockResolvedValue([]),
        embedQuery: vi.fn().mockResolvedValue([]),
        embedBatch: vi.fn().mockResolvedValue([]),
        dimension: 384,
        modelId: "test",
      },
      documents: {
        titlesByIds: vi.fn().mockResolvedValue(new Map()),
        pageImage: vi.fn().mockResolvedValue(null),
      },
      sandbox: { availableLanguages: ["javascript", "python"], run: vi.fn() },
      sympy: {
        checkSolution: vi.fn(),
        solveEquation: vi.fn(),
        simplify: vi.fn(),
        checkEquivalent: vi.fn(),
        parseLatex: vi.fn(),
      },
      pedagogyPack: null,
    },
    log: noopLogger,
  };
}

interface NormalizedTurn {
  text: string;
  toolCalls: Array<{ toolName: string; args: unknown }>;
  hasFinal: boolean;
}

async function collect(stream: AsyncIterable<EngineEvent>): Promise<NormalizedTurn> {
  let text = "";
  const toolCalls: NormalizedTurn["toolCalls"] = [];
  let hasFinal = false;
  for await (const event of stream) {
    if (event.type === "model_message") text += event.content;
    if (event.type === "tool_call") toolCalls.push({ toolName: event.toolName, args: event.args });
    if (event.type === "final") hasFinal = true;
  }
  return { text, toolCalls, hasFinal };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Engine conformance", () => {
  let registry: InProcessToolRegistry;
  let openOpts: EngineOpenOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new InProcessToolRegistry({
      tools: [echoTool],
      context: makeToolContext(),
      log: noopLogger,
    });
    openOpts = {
      systemPrompt: SCENARIO_SYSTEM_PROMPT,
      tools: registry,
    };
  });

  it("Claude Code adapter produces normalized turn", async () => {
    const { createConversation } = await import("@praxis/claude-cli-sdk");

    const resultEventObj = {
      type: "result" as const,
      subtype: "success" as const,
      sessionId: "test-session-id",
      result: "...done",
      usage: { inputTokens: 10, outputTokens: 20 },
    };

    vi.mocked(createConversation).mockImplementation(() => {
      async function* fakeStream() {
        yield { type: "assistant", text: "Calling echo...", delta: "Calling echo..." };
        yield {
          type: "tool_use",
          toolName: "mcp__praxis__test.echo",
          toolId: "tu-1",
          toolInput: { text: "hello" },
        };
        yield {
          type: "tool_result",
          toolId: "tu-1",
          content: JSON.stringify({ echoed: "hello" }),
          isError: false,
        };
        yield { type: "assistant", text: "...done", delta: "...done" };
        yield resultEventObj;
      }

      return {
        sessionId: Promise.resolve("test-session-id"),
        isOpen: true,
        send: () => {
          const stream = fakeStream();
          return Object.assign(stream, {
            result: Promise.resolve({
              result: "...done",
              sessionId: "test-session-id",
              resultEvent: resultEventObj,
            }),
          });
        },
        sendAndCollect: vi.fn(),
        sendToolResult: vi.fn(),
        close: vi.fn(async () => {}),
        abort: vi.fn(() => {}),
        [Symbol.asyncDispose]: vi.fn(async () => {}),
      };
    });

    const engine = new ClaudeCodeEngine({
      config: { engineId: "claude-code" },
      deps: { log: noopLogger },
    });
    const turn = await collect(runOneShot(engine, openOpts, SCENARIO_USER_MESSAGE));
    expect(turn.text).toContain("done");
    expect(turn.toolCalls).toEqual([{ toolName: "test.echo", args: { text: "hello" } }]);
    expect(turn.hasFinal).toBe(true);
  });

  it("Codex adapter produces normalized turn", async () => {
    const { Codex } = await import("@openai/codex-sdk");

    vi.mocked(Codex).mockImplementation(
      () =>
        ({
          startThread: vi.fn(() => ({
            runStreamed: vi.fn(async () => {
              async function* fakeEvents() {
                yield { type: "turn.started" };
                yield {
                  type: "item.completed",
                  item: { id: "i-0", type: "agent_message", text: "Calling echo..." },
                };
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
                    input_tokens: 10,
                    cached_input_tokens: 0,
                    output_tokens: 20,
                    reasoning_output_tokens: 0,
                  },
                };
              }
              return { events: fakeEvents() };
            }),
            run: vi.fn(),
            id: null,
          })),
          resumeThread: vi.fn(),
        }) as unknown as import("@openai/codex-sdk").Codex,
    );

    const engine = new CodexEngine({ config: { engineId: "codex" }, deps: { log: noopLogger } });
    const turn = await collect(runOneShot(engine, openOpts, SCENARIO_USER_MESSAGE));
    expect(turn.text).toContain("done");
    expect(turn.toolCalls).toEqual([{ toolName: "test.echo", args: { text: "hello" } }]);
    expect(turn.hasFinal).toBe(true);
  });

  it("Direct adapter produces normalized turn", async () => {
    const { streamText } = await import("ai");

    async function* fakeFullStream() {
      yield { type: "text-delta", delta: "Calling echo..." };
      yield { type: "text-end" };
      yield {
        type: "tool-call",
        toolName: "test.echo",
        toolCallId: "call-1",
        input: { text: "hello" },
      };
      yield { type: "tool-result", toolCallId: "call-1", output: { echoed: "hello" } };
      yield { type: "text-delta", delta: "...done" };
      yield { type: "text-end" };
      yield { type: "finish", totalUsage: { inputTokens: 10, outputTokens: 20 } };
    }

    vi.mocked(streamText).mockReturnValue({
      fullStream: fakeFullStream() as unknown as ReturnType<typeof streamText>["fullStream"],
    } as unknown as ReturnType<typeof streamText>);

    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps: { log: noopLogger },
      provider: "anthropic",
    });
    const turn = await collect(runOneShot(engine, openOpts, SCENARIO_USER_MESSAGE));
    expect(turn.text).toContain("done");
    expect(turn.toolCalls).toEqual([{ toolName: "test.echo", args: { text: "hello" } }]);
    expect(turn.hasFinal).toBe(true);
  });
});
