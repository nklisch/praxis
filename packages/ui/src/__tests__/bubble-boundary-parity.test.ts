/**
 * Bubble-boundary parity test suite (Unit 4).
 *
 * Cross-cutting invariant: given the same EngineEvent sequence, `useStreamedSend`
 * and `episodicToItems` produce structurally identical items arrays — same
 * item kinds, roles, content, and renderable attachments. Id values and
 * `streaming` flags may differ (live ends with false; replay starts with false).
 *
 * Each SCENARIO drives both sides:
 * - Live side: renderHook(useStreamedSend) with a fake client whose
 *   session.send yields the events.
 * - Replay side: episodicToItems() after wrapping events in EpisodicEvent
 *   envelopes (all turn 0, ts increments).
 */
import type { EngineEvent, EpisodicEvent, PraxisClient } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { episodicToItems } from "../hooks/episodic-to-messages.js";
import type { ChatStreamItem } from "../hooks/use-streamed-send.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a raw EngineEvent in a minimal EpisodicEvent envelope. */
function toEp(turnIndex: number, ts: number, event: EpisodicEvent["event"]): EpisodicEvent {
  return {
    id: `ep-${turnIndex}-${ts}` as EpisodicEvent["id"],
    sessionId: "s1" as EpisodicEvent["sessionId"],
    studentId: "stu1" as EpisodicEvent["studentId"],
    ts: ts as EpisodicEvent["ts"],
    source: { engineId: "claude-code", modeId: "teach", turnIndex },
    event,
  };
}

/**
 * Wrap a flat EngineEvent[] into EpisodicEvent[], all in turn 0.
 * The user message (first event, if present) gets ts=1; rest increment from 2.
 */
function wrapEvents(events: EngineEvent[]): EpisodicEvent[] {
  return events.map((e, i) => toEp(0, i + 1, e));
}

/**
 * Run the live side: renderHook + act, fake client yields the given events.
 * Prepends a synthetic user_message to the stream so both sides emit a user
 * bubble — parity comparison includes the user bubble.
 */
async function runLive(events: EngineEvent[]): Promise<ChatStreamItem[]> {
  // Prepend the canonical user turn event that the server echoes.
  const allEvents: EngineEvent[] = [{ type: "user_message", content: "test-question" }, ...events];
  const client: PraxisClient = makeFakeClient({
    session: {
      send: vi.fn(async function* () {
        for (const e of allEvents) yield e;
      }) as unknown as PraxisClient["session"]["send"],
    } as unknown as PraxisClient["session"],
  });

  const { result } = renderHook(() => useStreamedSend(client));
  await act(async () => {
    await result.current.send(brandId<"SessionId">("s1"), "test-question");
  });
  return result.current.items;
}

/**
 * Run the replay side: wrap events in episodic envelopes, call episodicToItems.
 * Prepends a user_message event so both sides emit a user bubble.
 */
function runReplay(events: EngineEvent[]): ChatStreamItem[] {
  const allEvents: EngineEvent[] = [{ type: "user_message", content: "test-question" }, ...events];
  return episodicToItems(wrapEvents(allEvents));
}

/**
 * Strip volatile fields (id, streaming, firstSeenAt) before equality comparison.
 * Normalizes ChatStreamItem[] to a stable shape for live-vs-replay parity checks.
 */
function stripIds(items: ChatStreamItem[]): unknown[] {
  return items.map((item) => {
    if (item.kind === "message") {
      const { id: _id, streaming: _streaming, ...rest } = item;
      return rest;
    }
    if (item.kind === "interstitial") {
      // firstSeenAt is a wall-clock timestamp; replay sets it to 0; live sets it to Date.now().
      // Strip it for parity comparison — the structural shape (kind, callId, toolName, status, errored) is what matters.
      const { firstSeenAt: _firstSeenAt, ...rest } = item;
      return rest;
    }
    // thinking, cancel-marker — no volatile fields
    return item;
  });
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

/** Scenario 1: Single assistant turn with one non-partial message. */
const SINGLE_TURN: EngineEvent[] = [
  { type: "model_message", content: "hi there", partial: false },
  { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
];

/** Scenario 2: Two bubbles separated by a tool round-trip. */
const TWO_BUBBLE_TOOL: EngineEvent[] = [
  { type: "model_message", content: "Let me check.", partial: false },
  { type: "tool_call", toolName: "grade_math", args: {}, callId: "t1" },
  { type: "tool_result", callId: "t1", result: { ok: true, tier: "deterministic", value: {} } },
  { type: "model_message", content: "Found it.", partial: false },
  { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
];

/** Scenario 3: Three bubbles, two tool round-trips. */
const THREE_BUBBLE_DOUBLE_TOOL: EngineEvent[] = [
  { type: "model_message", content: "First.", partial: false },
  { type: "tool_call", toolName: "grade_math", args: {}, callId: "t1" },
  { type: "tool_result", callId: "t1", result: { ok: true, tier: "deterministic", value: {} } },
  { type: "model_message", content: "Second.", partial: false },
  { type: "tool_call", toolName: "grade_math", args: {}, callId: "t2" },
  { type: "tool_result", callId: "t2", result: { ok: true, tier: "deterministic", value: {} } },
  { type: "model_message", content: "Third.", partial: false },
  { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
];

/** Scenario 4: Turn ends on tool_call with no subsequent model_message. */
const TOOL_ONLY_NO_SECOND_BUBBLE: EngineEvent[] = [
  { type: "model_message", content: "Starting.", partial: false },
  { type: "tool_call", toolName: "grade_math", args: {}, callId: "t1" },
  { type: "tool_result", callId: "t1", result: { ok: true, tier: "deterministic", value: {} } },
  { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
];

/** Scenario 5: Partials followed by a non-partial seal → one bubble. */
const PARTIALS_WITH_NON_PARTIAL_SEAL: EngineEvent[] = [
  { type: "model_message", content: "He", partial: true },
  { type: "model_message", content: "llo wor", partial: true },
  { type: "model_message", content: "Hello world", partial: false },
  { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
];

/** Scenario 6: Error mid-stream after a partial bubble. */
const ERROR_MID_STREAM: EngineEvent[] = [
  { type: "model_message", content: "Starting...", partial: true },
  { type: "error", error: { code: "engine.error", message: "kaboom", recoverable: false } },
];

/** Scenario 7: Citations attach to post-tool bubble (Unit 3). */
const CITATIONS_ON_POST_TOOL_BUBBLE: EngineEvent[] = [
  { type: "model_message", content: "Let me look.", partial: false },
  { type: "tool_call", toolName: "retrieve_from_textbook", args: {}, callId: "t1" },
  {
    type: "tool_result",
    callId: "t1",
    result: {
      ok: true,
      tier: "deterministic",
      value: { citations: [{ documentId: "d1", page: 42, snippet: "A derivative..." }] },
    },
  },
  { type: "model_message", content: "Found it.", partial: false },
  { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
];

/** Scenario 8: system_note closes bubble without emitting an item. */
const SYSTEM_NOTE_BOUNDARY: EngineEvent[] = [
  { type: "model_message", content: "A", partial: false },
  {
    type: "system_note",
    content: "child session submitted",
    origin: { kind: "system", topic: "parent_session" },
  },
  { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
];

// ── Parity tests ─────────────────────────────────────────────────────────────

describe("bubble-boundary parity: live vs replay", () => {
  it("single-turn: one user + one assistant bubble", async () => {
    const live = await runLive(SINGLE_TURN);
    const replay = runReplay(SINGLE_TURN);
    expect(stripIds(live)).toEqual(stripIds(replay));
    expect(live.filter((i) => i.kind === "message" && i.role === "assistant")).toHaveLength(1);
  });

  it("two-bubble-tool: assistant | interstitial | assistant", async () => {
    const live = await runLive(TWO_BUBBLE_TOOL);
    const replay = runReplay(TWO_BUBBLE_TOOL);
    expect(stripIds(live)).toEqual(stripIds(replay));
    expect(live.filter((i) => i.kind === "message" && i.role === "assistant")).toHaveLength(2);
    expect(live.filter((i) => i.kind === "interstitial")).toHaveLength(1);
  });

  it("three-bubble-double-tool: 3 assistant bubbles + 2 interstitials", async () => {
    const live = await runLive(THREE_BUBBLE_DOUBLE_TOOL);
    const replay = runReplay(THREE_BUBBLE_DOUBLE_TOOL);
    expect(stripIds(live)).toEqual(stripIds(replay));
    expect(live.filter((i) => i.kind === "message" && i.role === "assistant")).toHaveLength(3);
    expect(live.filter((i) => i.kind === "interstitial")).toHaveLength(2);
  });

  it("tool-only-no-second-bubble: one bubble, no trailing empty", async () => {
    const live = await runLive(TOOL_ONLY_NO_SECOND_BUBBLE);
    const replay = runReplay(TOOL_ONLY_NO_SECOND_BUBBLE);
    expect(stripIds(live)).toEqual(stripIds(replay));
    const assistants = live.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistants).toHaveLength(1);
    // No empty bubble
    const empty = assistants.find((a) => a.kind === "message" && a.content === "");
    expect(empty).toBeUndefined();
  });

  it("partials-with-non-partial-seal: one bubble with non-partial content", async () => {
    const live = await runLive(PARTIALS_WITH_NON_PARTIAL_SEAL);
    const replay = runReplay(PARTIALS_WITH_NON_PARTIAL_SEAL);
    expect(stripIds(live)).toEqual(stripIds(replay));
    const assistants = live.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.kind === "message" && assistants[0].content).toBe("Hello world");
  });

  it("error-mid-stream: one bubble sealed (streaming: false), no parity mismatch", async () => {
    const live = await runLive(ERROR_MID_STREAM);
    const replay = runReplay(ERROR_MID_STREAM);
    expect(stripIds(live)).toEqual(stripIds(replay));
    const assistants = live.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistants).toHaveLength(1);
    // Bubble sealed by finally / closeBubble
    expect(assistants[0]?.kind === "message" && assistants[0].streaming).toBe(false);
  });

  it("citations-on-post-tool-bubble: citations on second bubble, not first", async () => {
    const live = await runLive(CITATIONS_ON_POST_TOOL_BUBBLE);
    const replay = runReplay(CITATIONS_ON_POST_TOOL_BUBBLE);
    expect(stripIds(live)).toEqual(stripIds(replay));

    const assistants = live.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistants).toHaveLength(2);
    // First bubble: no citations
    expect(assistants[0]?.kind === "message" && assistants[0].citations).toBeUndefined();
    // Second bubble: citations present
    expect(assistants[1]?.kind === "message" && assistants[1].citations).toHaveLength(1);
  });

  it("system-note-boundary: one bubble, system_note not in items", async () => {
    const live = await runLive(SYSTEM_NOTE_BOUNDARY);
    const replay = runReplay(SYSTEM_NOTE_BOUNDARY);
    expect(stripIds(live)).toEqual(stripIds(replay));

    const assistants = live.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.kind === "message" && assistants[0].content).toBe("A");
    // Total items: user + assistant (no system_note item)
    const msgItems = live.filter((i) => i.kind === "message");
    expect(msgItems).toHaveLength(2);
  });
});
