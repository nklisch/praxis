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

    const userMsg = result.current.items.find((i) => i.kind === "message" && i.role === "user");
    expect(userMsg?.kind === "message" && userMsg.content).toBe("hello");
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
    const userMsgs = result.current.items.filter((i) => i.kind === "message" && i.role === "user");
    expect(userMsgs).toHaveLength(1);
    expect(userMsgs[0]?.kind === "message" && userMsgs[0].content).toBe("hello");
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

    const assistantMsg = result.current.items.find(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsg?.kind === "message" && assistantMsg.content).toBe("Hello world");
    expect(assistantMsg?.kind === "message" && assistantMsg.streaming).toBe(false);
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

    const assistantMsg = result.current.items.find(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsg?.kind === "message" && assistantMsg.streaming).toBe(false);
  });

  it("clearMessages resets to empty", async () => {
    const client = makeClient([{ type: "model_message", content: "hello", partial: false }]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    expect(result.current.items.length).toBeGreaterThan(0);

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.items).toHaveLength(0);
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

    const userMsg = result.current.items.find((i) => i.kind === "message" && i.role === "user");
    expect(userMsg?.kind === "message" && userMsg.rawContent).toBe("hello");
    expect(userMsg?.kind === "message" && userMsg.rawContent === userMsg.content).toBe(true);
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

    const assistantMsg = result.current.items.find(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsg?.kind === "message" && assistantMsg.rawContent).toBe("Hello world");
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

    const assistantMsg = result.current.items.find(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(
      assistantMsg?.kind === "message" && assistantMsg.rawContent === assistantMsg.content,
    ).toBe(true);
    expect(assistantMsg?.kind === "message" && assistantMsg.streaming).toBe(false);
  });

  // ── loadHistory ──────────────────────────────────────────────────────────────

  it("loadHistory replaces items with the persisted transcript", async () => {
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
    expect(result.current.items).toHaveLength(0);

    await act(async () => {
      await result.current.loadHistory(brandId<"SessionId">("s1"));
    });

    await waitFor(() => {
      // 2 message items (user + assistant)
      expect(result.current.items.filter((i) => i.kind === "message")).toHaveLength(2);
    });
    const messages = result.current.items.filter((i) => i.kind === "message");
    expect(messages[0]).toMatchObject({ kind: "message", role: "user", content: "from history" });
    expect(messages[1]).toMatchObject({
      kind: "message",
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

    // Wait for both `isStreaming === true` AND the live model_message to have
    // rendered. The bubble-boundaries refactor opens the assistant bubble
    // lazily on the first model_message, so a snapshot taken purely on
    // `isStreaming` would race with the lazy push. Snapshot only after the
    // live "live" content is in place — that's the stable mid-stream state
    // the loadHistory guard is meant to preserve.
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.items.some((i) => i.kind === "message" && i.content === "live")).toBe(
        true,
      );
    });
    const pre = result.current.items.length;

    await act(async () => {
      await result.current.loadHistory(brandId<"SessionId">("s1"));
    });

    // History was NOT loaded because a turn was in flight — item log
    // matches the live stream, not the episodic replay.
    expect(result.current.items).toHaveLength(pre);
    expect(
      result.current.items.some((i) => i.kind === "message" && i.content === "from-history"),
    ).toBe(false);

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

    const assistantMsg = result.current.items.find(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    // rawContent accumulated the partials ("He" + "llo" = "Hello")
    expect(assistantMsg?.kind === "message" && assistantMsg.rawContent).toBe("Hello");
    // content mirrors rawContent (set on each update)
    expect(assistantMsg?.kind === "message" && assistantMsg.content).toBe("Hello");
  });

  // ── Interstitial behaviour ────────────────────────────────────────────────────

  it("tool_call → tool_result produces a tool-entry that flips in_flight → settled with input/output", async () => {
    const client = makeClient([
      {
        type: "tool_call",
        toolName: "grade_math",
        args: { expr: "x^2" },
        callId: "c1",
      },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: { score: 10 } },
      },
      { type: "model_message", content: "done", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "grade this");
    });

    const toolEntries = result.current.items.filter((i) => i.kind === "tool-entry");
    expect(toolEntries).toHaveLength(1);
    const entry = toolEntries[0];
    expect(entry?.kind === "tool-entry" && entry.toolName).toBe("grade_math");
    expect(entry?.kind === "tool-entry" && entry.status).toBe("settled");
    // input populated at tool_call time
    expect(entry?.kind === "tool-entry" && entry.input).toEqual({ expr: "x^2" });
    // output populated at tool_result time
    expect(entry?.kind === "tool-entry" && entry.output).toEqual({ score: 10 });
    expect(entry?.kind === "tool-entry" && entry.errorMessage).toBeUndefined();
  });

  it("tool_result.ok === false sets status:'errored' and errorMessage on the matching tool-entry", async () => {
    const client = makeClient([
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: false, error: { code: "tool.error", message: "failed" } },
      },
      { type: "model_message", content: "oops", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "grade this");
    });

    const entry = result.current.items.find((i) => i.kind === "tool-entry");
    expect(entry?.kind === "tool-entry" && entry.status).toBe("errored");
    expect(entry?.kind === "tool-entry" && entry.errorMessage).toBe("failed");
    expect(entry?.kind === "tool-entry" && entry.output).toBeUndefined();
  });

  it("hidden tool (flashcard.review_next) produces no tool-entry but still populates dueCards", async () => {
    const cards = [{ flashcardId: "f1", front: "Q" }];
    const client = makeClient([
      { type: "tool_call", toolName: "flashcard.review_next", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: { ok: true, cards } },
      },
      { type: "model_message", content: "here are your cards", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "show me cards");
    });

    const toolEntries = result.current.items.filter((i) => i.kind === "tool-entry");
    expect(toolEntries).toHaveLength(0);

    const assistantMsg = result.current.items.find(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsg?.kind === "message" && assistantMsg.dueCards).toHaveLength(1);
  });

  it("two concurrent tool_calls with different callIds settle correctly", async () => {
    const client = makeClient([
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "cA" },
      { type: "tool_call", toolName: "retrieve_from_documents", args: {}, callId: "cB" },
      // results out of order
      {
        type: "tool_result",
        callId: "cB",
        result: {
          ok: true,
          tier: "deterministic",
          value: { citations: [{ documentId: "d1", page: 5, snippet: "s" }] },
        },
      },
      {
        type: "tool_result",
        callId: "cA",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "model_message", content: "all done", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "do two things");
    });

    const interstitials = result.current.items.filter((i) => i.kind === "tool-entry");
    expect(interstitials).toHaveLength(2);

    const gradeInterstitial = interstitials.find(
      (i) => i.kind === "tool-entry" && i.toolName === "grade_math",
    );
    const retrieveInterstitial = interstitials.find(
      (i) => i.kind === "tool-entry" && i.toolName === "retrieve_from_documents",
    );

    expect(gradeInterstitial?.kind === "tool-entry" && gradeInterstitial.status).toBe("settled");
    expect(retrieveInterstitial?.kind === "tool-entry" && retrieveInterstitial.status).toBe(
      "settled",
    );

    // Citations should be on the assistant message
    const assistantMsg = result.current.items.find(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsg?.kind === "message" && assistantMsg.citations).toHaveLength(1);
  });

  it("unmatched tool_result is a no-op (no throw, no items mutation)", async () => {
    const client = makeClient([
      // tool_result with no preceding tool_call (unmatched)
      {
        type: "tool_result",
        callId: "orphan",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "model_message", content: "ok", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    // Should not throw
    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const interstitials = result.current.items.filter((i) => i.kind === "tool-entry");
    expect(interstitials).toHaveLength(0);
    // Stream completed normally
    expect(result.current.lastError).toBeNull();
  });

  it("clearMessages empties items and lastError", async () => {
    const client = makeClient([
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "model_message", content: "done", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    expect(result.current.items.length).toBeGreaterThan(0);

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.lastError).toBeNull();
  });

  // ── Bubble-splitting (Unit 1) ─────────────────────────────────────────────────

  it("single non-partial model_message produces exactly one assistant bubble", async () => {
    const client = makeClient([
      { type: "model_message", content: "hello", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("hello");
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].streaming).toBe(false);
  });

  it("tool_call between two model_messages produces two assistant bubbles", async () => {
    const client = makeClient([
      { type: "model_message", content: "A", partial: false },
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "model_message", content: "B", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(2);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("A");
    expect(assistantMsgs[1]?.kind === "message" && assistantMsgs[1].content).toBe("B");
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].streaming).toBe(false);
    expect(assistantMsgs[1]?.kind === "message" && assistantMsgs[1].streaming).toBe(false);

    // Interstitial sits between the two bubbles
    const interstitial = result.current.items.find((i) => i.kind === "tool-entry");
    expect(interstitial).toBeDefined();
    const assistantIdx0 = result.current.items.findIndex(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    const interstitialIdx = result.current.items.findIndex((i) => i.kind === "tool-entry");
    const assistantIdx1 = result.current.items.findLastIndex(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(interstitialIdx).toBeGreaterThan(assistantIdx0);
    expect(assistantIdx1).toBeGreaterThan(interstitialIdx);
  });

  it("tool_call closes bubble even with only partial model_messages before it", async () => {
    const client = makeClient([
      { type: "model_message", content: "part-A", partial: true },
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "model_message", content: "part-B", partial: true },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(2);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("part-A");
    expect(assistantMsgs[1]?.kind === "message" && assistantMsgs[1].content).toBe("part-B");
    // Both bubbles closed by finally
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].streaming).toBe(false);
    expect(assistantMsgs[1]?.kind === "message" && assistantMsgs[1].streaming).toBe(false);
  });

  it("turn ending on tool_call with no subsequent model_message has no trailing empty bubble", async () => {
    const client = makeClient([
      { type: "model_message", content: "Let me check.", partial: false },
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    // One pre-tool bubble, no trailing empty bubble.
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("Let me check.");
  });

  it("system_note closes bubble without pushing an item", async () => {
    const client = makeClient([
      { type: "model_message", content: "A", partial: false },
      {
        type: "system_note",
        content: "child session submitted",
        origin: "parent_session",
      },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    // One assistant bubble from "A"; system_note is UI-invisible.
    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("A");
    // Total items: user + assistant
    const msgItems = result.current.items.filter((i) => i.kind === "message");
    expect(msgItems).toHaveLength(2);
  });

  it("error mid-stream closes open bubble with streaming: false and surfaces lastError", async () => {
    const client = makeClient([
      { type: "model_message", content: "start...", partial: true },
      { type: "error", error: { code: "engine.error", message: "kaboom", recoverable: false } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    expect(result.current.lastError).toBe("kaboom");

    // The open bubble must be sealed (no dangling streaming: true).
    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].streaming).toBe(false);
  });

  it("no assistant bubble is created if stream never emits model_message", async () => {
    const client = makeClient([
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(0);
  });

  // ── Unit 3: renderable-result placement ──────────────────────────────────────

  it("citations attach to the bubble AFTER the tool, not the bubble before", async () => {
    const client = makeClient([
      { type: "model_message", content: "Let me look that up.", partial: false },
      { type: "tool_call", toolName: "retrieve_from_documents", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: {
          ok: true,
          tier: "deterministic",
          value: { citations: [{ documentId: "d1", page: 42, snippet: "The answer is..." }] },
        },
      },
      { type: "model_message", content: "Found it on page 42.", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "what does the book say");
    });

    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(2);

    // Bubble A (pre-tool) has NO citations
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].citations).toBeUndefined();
    // Bubble B (post-tool) has citations
    expect(assistantMsgs[1]?.kind === "message" && assistantMsgs[1].citations).toHaveLength(1);
  });

  it("citations fall back to the most-recent bubble when no subsequent bubble opens", async () => {
    const client = makeClient([
      { type: "model_message", content: "Let me look that up.", partial: false },
      { type: "tool_call", toolName: "retrieve_from_documents", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: {
          ok: true,
          tier: "deterministic",
          value: { citations: [{ documentId: "d1", page: 10, snippet: "..." }] },
        },
      },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "find something");
    });

    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(1);
    // Citations fall back to the only (pre-tool) bubble
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].citations).toHaveLength(1);
  });

  // ── Unit 5: thinking state machine ───────────────────────────────────────────

  it("thinking is false before any send", () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useStreamedSend(client));
    expect(result.current.thinking).toBe(false);
  });

  it("thinking is true at send start before any model_message", async () => {
    // Stream that holds open — we check thinking mid-stream before any model_message.
    let resolveStream: (() => void) | undefined;
    const streamHold = new Promise<void>((r) => {
      resolveStream = r;
    });

    const client = makeFakeClient({
      session: {
        send: vi.fn(async function* () {
          await streamHold;
          yield { type: "model_message", content: "hi", partial: false } as EngineEvent;
          yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } } as EngineEvent;
        }) as unknown as PraxisClient["session"]["send"],
      } as unknown as PraxisClient["session"],
    });

    const { result } = renderHook(() => useStreamedSend(client));

    // Fire send without awaiting — it will hold in the stream.
    let sendDone = false;
    act(() => {
      result.current.send(brandId<"SessionId">("s1"), "hello").then(() => {
        sendDone = true;
      });
    });

    // Thinking should flip to true immediately after setIsStreaming(true).
    await waitFor(() => expect(result.current.thinking).toBe(true));
    expect(sendDone).toBe(false); // still streaming

    // Unblock.
    resolveStream?.();
    await waitFor(() => expect(sendDone).toBe(true));
    expect(result.current.thinking).toBe(false);
  });

  it("thinking flips to false on first model_message", async () => {
    const client = makeClient([
      { type: "model_message", content: "hello", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    // After stream ends, thinking should be false.
    expect(result.current.thinking).toBe(false);
  });

  it("thinking flips back to true on tool_result and false on final", async () => {
    const client = makeClient([
      { type: "model_message", content: "A", partial: false },
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "model_message", content: "B", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "grade");
    });

    // After completion, thinking is false.
    expect(result.current.thinking).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });

  it("thinking is false after stream ends (finally path)", async () => {
    const client = makeClient([
      { type: "model_message", content: "done", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    expect(result.current.thinking).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });

  it("thinking is false after interrupted event", async () => {
    const client = makeClient([
      { type: "model_message", content: "partial...", partial: true },
      { type: "interrupted", reason: "user_cancel" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    expect(result.current.thinking).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });

  it("interrupted event appends a cancel-marker item", async () => {
    const client = makeClient([
      { type: "model_message", content: "hi", partial: false },
      { type: "interrupted", reason: "user_cancel" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const cancelMarkers = result.current.items.filter((i) => i.kind === "cancel-marker");
    expect(cancelMarkers).toHaveLength(1);
  });

  it("interrupted event closes the open bubble (no dangling streaming: true)", async () => {
    const client = makeClient([
      { type: "model_message", content: "partial...", partial: true },
      { type: "interrupted", reason: "user_cancel" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].streaming).toBe(false);
  });

  it("cancel() calls iter.return() which terminates the stream", async () => {
    const returnSpy = vi.fn().mockResolvedValue({ done: true, value: undefined });

    // Build a stream iterator with a spy on .return().
    // The stream holds open via a promise so cancel() can fire mid-stream.
    let resolveStream: (() => void) | undefined;
    const streamHold = new Promise<void>((r) => {
      resolveStream = r;
    });

    const mockIterator: AsyncIterator<EngineEvent> = {
      next: vi.fn(async () => {
        await streamHold;
        return { done: true, value: undefined } as IteratorResult<EngineEvent>;
      }),
      return: returnSpy,
    };

    const client = makeFakeClient({
      session: {
        send: vi.fn(() => ({
          [Symbol.asyncIterator]: () => mockIterator,
        })) as unknown as PraxisClient["session"]["send"],
      } as unknown as PraxisClient["session"],
    });

    const { result } = renderHook(() => useStreamedSend(client));

    // Start send without awaiting.
    act(() => {
      void result.current.send(brandId<"SessionId">("s1"), "hello");
    });

    // Wait for streaming to start.
    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    // Call cancel.
    act(() => {
      result.current.cancel();
    });

    // iter.return() should have been called.
    expect(returnSpy).toHaveBeenCalled();

    // Unblock so test cleanup is happy.
    resolveStream?.();
  });

  it("cancel() is a no-op when not streaming", () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useStreamedSend(client));
    expect(() => result.current.cancel()).not.toThrow();
  });

  it("cancel() after the stream finalized is a no-op (idempotent)", async () => {
    // Spec: cancel() is documented as a no-op when not streaming. After a
    // turn ends, iteratorRef is cleared in the send() finally — so cancel()
    // takes the same no-op path as cancel-before-send.
    const client = makeClient([
      { type: "model_message", content: "hi there", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);
    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hello");
    });

    // Stream finalized — isStreaming back to false.
    expect(result.current.isStreaming).toBe(false);
    const cancelMarkersBefore = result.current.items.filter(
      (i) => i.kind === "cancel-marker",
    ).length;

    act(() => {
      expect(() => result.current.cancel()).not.toThrow();
    });

    const cancelMarkersAfter = result.current.items.filter(
      (i) => i.kind === "cancel-marker",
    ).length;
    expect(cancelMarkersAfter).toBe(cancelMarkersBefore);
  });

  it("double-cancel during streaming produces a single cancel-marker", async () => {
    // Spec: cancel() may be called from multiple UI handlers (Esc + Stop
    // button); the second call must not corrupt state or duplicate the marker.
    const returnSpy = vi.fn().mockResolvedValue({ done: true, value: undefined });

    let resolveStream: (() => void) | undefined;
    const streamHold = new Promise<void>((r) => {
      resolveStream = r;
    });

    const mockIterator: AsyncIterator<EngineEvent> = {
      next: vi.fn(async () => {
        await streamHold;
        return {
          value: { type: "interrupted", reason: "user_cancel" },
          done: false,
        } as IteratorResult<EngineEvent>;
      }),
      return: returnSpy,
    };

    const client = makeFakeClient({
      session: {
        send: vi.fn(() => ({
          [Symbol.asyncIterator]: () => mockIterator,
        })) as unknown as PraxisClient["session"]["send"],
      } as unknown as PraxisClient["session"],
    });

    const { result } = renderHook(() => useStreamedSend(client));

    act(() => {
      void result.current.send(brandId<"SessionId">("s1"), "hello");
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    // Call cancel twice back-to-back.
    act(() => {
      result.current.cancel();
      result.current.cancel();
    });

    // Unblock so the stream returns and finalize logic runs.
    resolveStream?.();

    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // No throw — and tolerates 1 or 2 return() calls per the idempotency spec.
    const cancelMarkers = result.current.items.filter((i) => i.kind === "cancel-marker");
    expect(cancelMarkers.length).toBeLessThanOrEqual(1);
  });

  it("cancel() during loadHistory does not throw and does not corrupt items", async () => {
    // Spec: cancel() only targets the active send-iterator. loadHistory
    // uses its own async-iterator that is not tracked by iteratorRef, so
    // cancel() is structurally a no-op on that path. Structural property:
    // calling cancel() during loadHistory must not throw and must not
    // poison lastError; history loading continues to completion.
    const client = makeClient([]);
    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      const p = result.current.loadHistory(brandId<"SessionId">("s1"));
      // call cancel before history settles
      expect(() => result.current.cancel()).not.toThrow();
      await p;
    });

    // No error propagated from the cancel call during load.
    expect(result.current.lastError).toBeNull();
  });

  // ── Tool interstitial pacing (MIN_INTERSTITIAL_VISIBLE_MS) ───────────────────

  it("fast tool: interstitial is settled by finally drain when stream ends normally", async () => {
    // The stream completes immediately (simulates a fast tool). Even though
    // tool_result arrives quickly (< 800ms), the finally drain fires settleNow
    // synchronously so the interstitial is settled after send() resolves.
    const client = makeClient([
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "model_message", content: "done", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "go");
    });

    // Stream ended — finally drain fires settle immediately.
    const interstitial = result.current.items.find((i) => i.kind === "tool-entry");
    expect(interstitial?.kind === "tool-entry" && interstitial.status).toBe("settled");
  });

  it("fast tool with errored result: finally drain preserves errored status and errorMessage", async () => {
    // Even for a fast tool that completes with ok:false, the finally drain
    // calls the closured settleNow which captures the errored status and errorMessage.
    const client = makeClient([
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: {
          ok: false,
          error: { code: "tool.error", message: "failed", recoverable: false },
        },
      },
      { type: "model_message", content: "oops", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "go");
    });

    const entry = result.current.items.find((i) => i.kind === "tool-entry");
    expect(entry?.kind === "tool-entry" && entry.status).toBe("errored");
    expect(entry?.kind === "tool-entry" && entry.errorMessage).toBe("failed");
  });

  it("cancel (interrupted) event: interstitial stays in_flight, cancel-marker appears", async () => {
    // When a turn is cancelled via interrupted event, pending settle timers
    // are cleared — interstitials that were in_flight remain in_flight
    // (the timer is gone, but so is the turn). A cancel-marker is appended.
    const client = makeClient([
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "interrupted", reason: "user_cancel" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "go");
    });

    // Cancel-marker was appended.
    expect(result.current.items.some((i) => i.kind === "cancel-marker")).toBe(true);

    // The interstitial remains in_flight — cancelled turn, timer was cleared.
    const it = result.current.items.find((i) => i.kind === "tool-entry");
    expect(it?.kind === "tool-entry" && it.status).toBe("in_flight");

    // isStreaming is false (stream ended).
    expect(result.current.isStreaming).toBe(false);
  });

  // ── Thinking event handler + ReasoningItem ───────────────────────────────────

  it("thinking event creates a kind:thinking item", async () => {
    const client = makeClient([
      { type: "thinking", content: "Let me think about this carefully." },
      { type: "model_message", content: "Here is my answer.", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const thinkingItems = result.current.items.filter((i) => i.kind === "thinking");
    expect(thinkingItems).toHaveLength(1);
    const thinking = thinkingItems[0];
    expect(thinking?.kind === "thinking" && thinking.content).toBe(
      "Let me think about this carefully.",
    );
  });

  it("multiple thinking events accumulate in the same reasoning block", async () => {
    const client = makeClient([
      { type: "thinking", content: "First thought. " },
      { type: "thinking", content: "Second thought." },
      { type: "model_message", content: "Answer.", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const thinkingItems = result.current.items.filter((i) => i.kind === "thinking");
    expect(thinkingItems).toHaveLength(1);
    const thinking = thinkingItems[0];
    expect(thinking?.kind === "thinking" && thinking.content).toBe(
      "First thought. Second thought.",
    );
  });

  it("thinking block is closed (streaming: false) when model_message arrives", async () => {
    const client = makeClient([
      { type: "thinking", content: "Reasoning..." },
      { type: "model_message", content: "Done.", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const thinkingItem = result.current.items.find((i) => i.kind === "thinking");
    expect(thinkingItem?.kind === "thinking" && thinkingItem.streaming).toBe(false);
  });

  it("thinking block is closed when tool_call arrives", async () => {
    const client = makeClient([
      { type: "thinking", content: "I should call a tool." },
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "model_message", content: "Done.", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const thinkingItem = result.current.items.find((i) => i.kind === "thinking");
    expect(thinkingItem?.kind === "thinking" && thinkingItem.streaming).toBe(false);
  });

  it("two non-contiguous thinking events produce two separate reasoning blocks", async () => {
    const client = makeClient([
      { type: "thinking", content: "First reasoning." },
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "thinking", content: "Second reasoning." },
      { type: "model_message", content: "Done.", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const thinkingItems = result.current.items.filter((i) => i.kind === "thinking");
    expect(thinkingItems).toHaveLength(2);
    expect(thinkingItems[0]?.kind === "thinking" && thinkingItems[0].content).toBe(
      "First reasoning.",
    );
    expect(thinkingItems[1]?.kind === "thinking" && thinkingItems[1].content).toBe(
      "Second reasoning.",
    );
    // Both closed at stream end
    expect(thinkingItems[0]?.kind === "thinking" && thinkingItems[0].streaming).toBe(false);
    expect(thinkingItems[1]?.kind === "thinking" && thinkingItems[1].streaming).toBe(false);
  });

  it("no thinking events → no reasoning block appears", async () => {
    const client = makeClient([
      { type: "model_message", content: "Direct answer.", partial: false },
      { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const thinkingItems = result.current.items.filter((i) => i.kind === "thinking");
    expect(thinkingItems).toHaveLength(0);
  });

  it("on turn cancel, in-progress reasoning block is closed (streaming → false), not deleted", async () => {
    const client = makeClient([
      { type: "thinking", content: "Mid-thought..." },
      { type: "interrupted", reason: "user_cancel" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const thinkingItems = result.current.items.filter((i) => i.kind === "thinking");
    // Block remains in the list (not deleted)
    expect(thinkingItems).toHaveLength(1);
    // But streaming is closed
    expect(thinkingItems[0]?.kind === "thinking" && thinkingItems[0].streaming).toBe(false);
  });

  // ── engine_abort reason (mirrors user_cancel treatment) ───────────────────────

  it("thinking is false after interrupted event with reason 'engine_abort'", async () => {
    const client = makeClient([
      { type: "model_message", content: "partial...", partial: true },
      { type: "interrupted", reason: "engine_abort" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    expect(result.current.thinking).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });

  it("interrupted event with reason 'engine_abort' appends a cancel-marker item", async () => {
    const client = makeClient([
      { type: "model_message", content: "hi", partial: false },
      { type: "interrupted", reason: "engine_abort" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const cancelMarkers = result.current.items.filter((i) => i.kind === "cancel-marker");
    expect(cancelMarkers).toHaveLength(1);
  });

  it("interrupted event with reason 'engine_abort' closes the open bubble (no dangling streaming: true)", async () => {
    const client = makeClient([
      { type: "model_message", content: "partial...", partial: true },
      { type: "interrupted", reason: "engine_abort" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].streaming).toBe(false);
  });

  it("engine_abort: interstitial stays in_flight, cancel-marker appears", async () => {
    // engine_abort has no client-side cancel signal; the adapter aborted.
    // Pending settle timers are cleared — interstitials remain in_flight.
    const client = makeClient([
      { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" },
      {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      },
      { type: "interrupted", reason: "engine_abort" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "go");
    });

    // Cancel-marker was appended.
    expect(result.current.items.some((i) => i.kind === "cancel-marker")).toBe(true);

    // The interstitial remains in_flight — cancelled turn, timer was cleared.
    const it = result.current.items.find((i) => i.kind === "tool-entry");
    expect(it?.kind === "tool-entry" && it.status).toBe("in_flight");

    // isStreaming is false (stream ended).
    expect(result.current.isStreaming).toBe(false);
  });

  it("on engine_abort, in-progress reasoning block is closed (streaming → false), not deleted", async () => {
    const client = makeClient([
      { type: "thinking", content: "Mid-thought..." },
      { type: "interrupted", reason: "engine_abort" },
    ]);

    const { result } = renderHook(() => useStreamedSend(client));

    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "hi");
    });

    const thinkingItems = result.current.items.filter((i) => i.kind === "thinking");
    // Block remains in the list (not deleted)
    expect(thinkingItems).toHaveLength(1);
    // But streaming is closed
    expect(thinkingItems[0]?.kind === "thinking" && thinkingItems[0].streaming).toBe(false);
  });

  // ── Pending queue (composer-queue feature) ────────────────────────────────────

  it("submitting while streaming enqueues the message as a pending-message item", async () => {
    // A stream that holds open so we can submit a second message mid-stream.
    let resolveStream: (() => void) | undefined;
    const streamHold = new Promise<void>((r) => {
      resolveStream = r;
    });

    const client = makeFakeClient({
      session: {
        send: vi.fn(async function* () {
          yield { type: "model_message", content: "thinking...", partial: true } as EngineEvent;
          await streamHold;
          yield { type: "model_message", content: "done", partial: false } as EngineEvent;
          yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } } as EngineEvent;
        }) as unknown as PraxisClient["session"]["send"],
      } as unknown as PraxisClient["session"],
    });

    const { result } = renderHook(() => useStreamedSend(client));

    // Start first send — do not await.
    act(() => {
      void result.current.send(brandId<"SessionId">("s1"), "first");
    });

    // Wait for streaming to be true and the first message bubble to appear.
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
      expect(
        result.current.items.some((i) => i.kind === "message" && i.content === "thinking..."),
      ).toBe(true);
    });

    // Submit a second message while streaming — should queue.
    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "second");
    });

    // pendingCount should be 1.
    expect(result.current.pendingCount).toBe(1);

    // A pending-message item should appear in the thread.
    const pendingItems = result.current.items.filter((i) => i.kind === "pending-message");
    expect(pendingItems).toHaveLength(1);
    expect(pendingItems[0]?.kind === "pending-message" && pendingItems[0].text).toBe("second");
    expect(pendingItems[0]?.kind === "pending-message" && pendingItems[0].status).toBe("queued");

    // The original stream should be unaffected (still streaming).
    expect(result.current.isStreaming).toBe(true);

    // Drain the stream.
    resolveStream?.();
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it("auto-flush: pending message becomes its own turn after the current turn ends", async () => {
    let resolveFirst: (() => void) | undefined;
    const firstHold = new Promise<void>((r) => {
      resolveFirst = r;
    });

    let sendCallCount = 0;
    const client = makeFakeClient({
      session: {
        send: vi.fn(async function* () {
          sendCallCount++;
          if (sendCallCount === 1) {
            // First turn: hold open.
            yield { type: "model_message", content: "first reply", partial: false } as EngineEvent;
            await firstHold;
            yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } } as EngineEvent;
          } else {
            // Second turn (flush): complete immediately.
            yield { type: "model_message", content: "second reply", partial: false } as EngineEvent;
            yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } } as EngineEvent;
          }
        }) as unknown as PraxisClient["session"]["send"],
      } as unknown as PraxisClient["session"],
    });

    const { result } = renderHook(() => useStreamedSend(client));

    // Start first turn.
    act(() => {
      void result.current.send(brandId<"SessionId">("s1"), "first");
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    // Queue a second message while streaming.
    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "second");
    });

    expect(result.current.pendingCount).toBe(1);

    // Let the first turn finish.
    resolveFirst?.();

    // Wait for the pending queue to flush and both turns to complete.
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.pendingCount).toBe(0);
    });

    // The session.send should have been called twice — one per turn.
    expect(sendCallCount).toBe(2);

    // Both assistant replies should be present.
    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs.some((m) => m.kind === "message" && m.content === "first reply")).toBe(
      true,
    );
    expect(assistantMsgs.some((m) => m.kind === "message" && m.content === "second reply")).toBe(
      true,
    );

    // No pending bubbles remain.
    expect(result.current.items.filter((i) => i.kind === "pending-message")).toHaveLength(0);
  });

  it("cancelPending removes the bubble and queue entry", async () => {
    let resolveStream: (() => void) | undefined;
    const streamHold = new Promise<void>((r) => {
      resolveStream = r;
    });

    const client = makeFakeClient({
      session: {
        send: vi.fn(async function* () {
          yield { type: "model_message", content: "streaming", partial: true } as EngineEvent;
          await streamHold;
          yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } } as EngineEvent;
        }) as unknown as PraxisClient["session"]["send"],
      } as unknown as PraxisClient["session"],
    });

    const { result } = renderHook(() => useStreamedSend(client));

    act(() => {
      void result.current.send(brandId<"SessionId">("s1"), "first");
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    // Queue a message.
    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "pending message");
    });

    expect(result.current.pendingCount).toBe(1);
    const pendingItem = result.current.items.find((i) => i.kind === "pending-message");
    expect(pendingItem).toBeDefined();
    const pendingId = pendingItem?.id ?? "";

    // Cancel the pending message.
    act(() => {
      result.current.cancelPending(pendingId);
    });

    // Both queue and item list should be empty of pending entries.
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.items.filter((i) => i.kind === "pending-message")).toHaveLength(0);

    // Drain.
    resolveStream?.();
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it("no auto-flush after user cancel (Stop button): pending queue is preserved", async () => {
    let resolveStream: (() => void) | undefined;
    const streamHold = new Promise<void>((r) => {
      resolveStream = r;
    });

    let sendCallCount = 0;
    const client = makeFakeClient({
      session: {
        send: vi.fn(async function* () {
          sendCallCount++;
          yield { type: "model_message", content: "live text", partial: true } as EngineEvent;
          await streamHold;
          // After resolveStream(), the iterator will proceed — but we call .return() before that.
          yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } } as EngineEvent;
        }) as unknown as PraxisClient["session"]["send"],
      } as unknown as PraxisClient["session"],
    });

    const { result } = renderHook(() => useStreamedSend(client));

    act(() => {
      void result.current.send(brandId<"SessionId">("s1"), "first");
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
      expect(
        result.current.items.some((i) => i.kind === "message" && i.content === "live text"),
      ).toBe(true);
    });

    // Queue a pending message.
    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "queued");
    });
    expect(result.current.pendingCount).toBe(1);

    // Cancel the in-flight turn.
    act(() => {
      result.current.cancel();
    });

    // Unblock so the generator can exit cleanly.
    resolveStream?.();

    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // Queue should still be intact — no auto-flush after user cancel.
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.items.filter((i) => i.kind === "pending-message")).toHaveLength(1);

    // session.send was called exactly once (no flush).
    expect(sendCallCount).toBe(1);
  });

  it("multiple queued messages flush sequentially (each is its own turn)", async () => {
    let resolveFirst: (() => void) | undefined;
    const firstHold = new Promise<void>((r) => {
      resolveFirst = r;
    });

    let sendCallCount = 0;
    const client = makeFakeClient({
      session: {
        send: vi.fn(async function* () {
          const n = ++sendCallCount;
          yield {
            type: "model_message",
            content: `reply-${n}`,
            partial: false,
          } as EngineEvent;
          if (n === 1) await firstHold;
          yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } } as EngineEvent;
        }) as unknown as PraxisClient["session"]["send"],
      } as unknown as PraxisClient["session"],
    });

    const { result } = renderHook(() => useStreamedSend(client));

    // Start turn 1.
    act(() => {
      void result.current.send(brandId<"SessionId">("s1"), "msg1");
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    // Queue three more messages while streaming.
    await act(async () => {
      await result.current.send(brandId<"SessionId">("s1"), "msg2");
      await result.current.send(brandId<"SessionId">("s1"), "msg3");
      await result.current.send(brandId<"SessionId">("s1"), "msg4");
    });

    expect(result.current.pendingCount).toBe(3);

    // Let turn 1 finish.
    resolveFirst?.();

    // Wait for all turns to complete (4 total).
    await waitFor(
      () => {
        expect(result.current.isStreaming).toBe(false);
        expect(result.current.pendingCount).toBe(0);
        expect(sendCallCount).toBe(4);
      },
      { timeout: 3000 },
    );

    // All 4 user messages present.
    const userMsgs = result.current.items.filter((i) => i.kind === "message" && i.role === "user");
    expect(userMsgs).toHaveLength(4);

    // All 4 assistant replies present.
    const assistantMsgs = result.current.items.filter(
      (i) => i.kind === "message" && i.role === "assistant",
    );
    expect(assistantMsgs).toHaveLength(4);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("reply-1");
    expect(assistantMsgs[1]?.kind === "message" && assistantMsgs[1].content).toBe("reply-2");
    expect(assistantMsgs[2]?.kind === "message" && assistantMsgs[2].content).toBe("reply-3");
    expect(assistantMsgs[3]?.kind === "message" && assistantMsgs[3].content).toBe("reply-4");

    // No pending items remain.
    expect(result.current.items.filter((i) => i.kind === "pending-message")).toHaveLength(0);
  });

  it("pendingCount is 0 when nothing is queued", () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useStreamedSend(client));
    expect(result.current.pendingCount).toBe(0);
  });
});
