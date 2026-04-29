import type { EngineEvent, PraxisClient } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStreamedSend } from "../hooks/use-streamed-send.js";

function makeClient(events: EngineEvent[]): PraxisClient {
  return {
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
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
  };
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
});
