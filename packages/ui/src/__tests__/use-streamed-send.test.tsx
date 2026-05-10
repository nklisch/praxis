import type { EngineEvent, EpisodicEvent, PraxisClient } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { makeFakeClient } from "./helpers/fake-client.js";

function makeClient(events: EngineEvent[], history: EpisodicEvent[] = []): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({ sessionId: "s1", modeId: "teach", startedAt: Date.now() }),
      end: vi.fn().mockResolvedValue({
        sessionId: "s1",
        endedAt: Date.now(),
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(async function* () {
        for (const e of events) yield e;
      }) as unknown as PraxisClient["session"]["send"],
    },
    memory: {
      episodic: vi.fn(async function* () {
        for (const ev of history) yield ev;
      }) as unknown as PraxisClient["memory"]["episodic"],
    } as unknown as PraxisClient["memory"],
  });
}

describe("useStreamedSend", () => {
  it("adds user bubble immediately before stream arrives", async () => {
    const client = makeClient([
      { type: "model_message", content: "hi there", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hello");
    });

    const userMsg = result.current.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("hello");
  });

  it("ignores user_message events from the stream", async () => {
    const client = makeClient([
      { type: "user_message", content: "hello" }, // should be ignored
      { type: "model_message", content: "response", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hello");
    });

    // Should only have one user message (from local state), not two.
    const userMsgs = result.current.messages.filter((m) => m.role === "user");
    expect(userMsgs).toHaveLength(1);
    expect(userMsgs[0]?.content).toBe("hello");
  });

  it("accumulates partial deltas", async () => {
    const client = makeClient([
      { type: "model_message", content: "He", partial: true },
      { type: "model_message", content: "llo", partial: true },
      { type: "model_message", content: "Hello world", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const assistantMsg = result.current.messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.content).toBe("Hello world");
    expect(assistantMsg?.streaming).toBe(false);
  });

  it("sets lastError on error event", async () => {
    const client = makeClient([
      { type: "error", error: { code: "engine.error", message: "boom", recoverable: false } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    expect(result.current.lastError).toBe("boom");
  });

  it("marks assistant message as done (not streaming) after stream ends", async () => {
    const client = makeClient([
      { type: "model_message", content: "done!", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "test");
    });

    const assistantMsg = result.current.messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.streaming).toBe(false);
  });

  it("clearMessages resets to empty", async () => {
    const client = makeClient([{ type: "model_message", content: "hello", partial: false }]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toHaveLength(0);
  });

  // ── rawContent field ─────────────────────────────────────────────────────────

  it("user message has rawContent equal to the sent text", async () => {
    const client = makeClient([
      { type: "model_message", content: "hi there", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hello");
    });

    const userMsg = result.current.messages.find((m) => m.role === "user");
    expect(userMsg?.rawContent).toBe("hello");
    expect(userMsg?.rawContent).toBe(userMsg?.content);
  });

  it("assistant message rawContent is populated with streamed content", async () => {
    const client = makeClient([
      { type: "model_message", content: "He", partial: true },
      { type: "model_message", content: "llo", partial: true },
      { type: "model_message", content: "Hello world", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const assistantMsg = result.current.messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.rawContent).toBe("Hello world");
  });

  it("rawContent equals content on the settled assistant message", async () => {
    const client = makeClient([
      { type: "model_message", content: "done!", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "test");
    });

    const assistantMsg = result.current.messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.rawContent).toBe(assistantMsg?.content);
    expect(assistantMsg?.streaming).toBe(false);
  });

  // ── loadHistory ──────────────────────────────────────────────────────────────

  it("loadHistory replaces messages with the persisted transcript", async () => {
    const history: EpisodicEvent[] = [
      {
        id: "e1" as EpisodicEvent["id"],
        sessionId: "s1" as EpisodicEvent["sessionId"],
        studentId: "stu1" as EpisodicEvent["studentId"],
        ts: 1 as EpisodicEvent["ts"],
        source: { engineId: "claude-code", modeId: "teach", turnIndex: 0 },
        event: { type: "user_message", content: "from history" },
      },
      {
        id: "e2" as EpisodicEvent["id"],
        sessionId: "s1" as EpisodicEvent["sessionId"],
        studentId: "stu1" as EpisodicEvent["studentId"],
        ts: 2 as EpisodicEvent["ts"],
        source: { engineId: "claude-code", modeId: "teach", turnIndex: 0 },
        event: { type: "model_message", content: "old reply", partial: false },
      },
    ];
    const client = makeClient([], history);

    const { result } = renderHook(() => useStreamedSend(client));
    expect(result.current.messages).toHaveLength(0);

    await act(async () => {
      await result.current.loadHistory(brandId<"SessionId">("s1"));
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
    expect(result.current.messages[0]).toMatchObject({ role: "user", content: "from history" });
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "old reply",
      streaming: false,
    });
  });

  it("loadHistory is a no-op while a turn is mid-stream", async () => {
    // Build a stream that yields one event then awaits forever so isStreaming
    // stays true for the duration of the test.
    let resolveStream: (() => void) | undefined;
    const streamHold = new Promise<void>((r) => {
      resolveStream = r;
    });
    const history: EpisodicEvent[] = [
      {
        id: "e1" as EpisodicEvent["id"],
        sessionId: "s1" as EpisodicEvent["sessionId"],
        studentId: "stu1" as EpisodicEvent["studentId"],
        ts: 1 as EpisodicEvent["ts"],
        source: { engineId: "claude-code", modeId: "teach", turnIndex: 0 },
        event: { type: "user_message", content: "from-history" },
      },
    ];
    const client = makeFakeClient({
      session: {
        send: vi.fn(async function* () {
          yield { type: "model_message", content: "live", partial: false } as EngineEvent;
          await streamHold; // hold the stream open
        }) as unknown as PraxisClient["session"]["send"],
      } as unknown as PraxisClient["session"],
      memory: {
        episodic: vi.fn(async function* () {
          for (const ev of history) yield ev;
        }) as unknown as PraxisClient["memory"]["episodic"],
      } as unknown as PraxisClient["memory"],
    });

    const { result } = renderHook(() => useStreamedSend(client));

    // Kick off a send; don't await it.
    let sendPromise: Promise<void> | undefined;
    act(() => {
      sendPromise = result.current.send(brandId<"SessionId">("s1"), "user-text");
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    const pre = result.current.messages.length;

    await act(async () => {
      await result.current.loadHistory(brandId<"SessionId">("s1"));
    });

    // History was NOT loaded because a turn was in flight — message log
    // matches the live stream, not the episodic replay.
    expect(result.current.messages).toHaveLength(pre);
    expect(result.current.messages.some((m) => m.content === "from-history")).toBe(false);

    // Drain so vitest's async tracking is happy.
    resolveStream?.();
    await act(async () => {
      await sendPromise;
    });
  });

  it("assistant message placeholder is initialized with rawContent=''", async () => {
    // Verify that after a send completes, the assistant message had rawContent
    // set from the start (we verify it equals the final content, which was
    // accumulated from "" upward — the key invariant is rawContent is always set).
    const client = makeClient([
      { type: "model_message", content: "He", partial: true },
      { type: "model_message", content: "llo", partial: true },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hello");
    });

    const assistantMsg = result.current.messages.find((m) => m.role === "assistant");
    // rawContent accumulated the partials ("He" + "llo" = "Hello")
    expect(assistantMsg?.rawContent).toBe("Hello");
    // content mirrors rawContent (set on each update)
    expect(assistantMsg?.content).toBe("Hello");
  });
});
