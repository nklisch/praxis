import type { EngineEvent, EpisodicEvent, PraxisClient } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { episodicToItems } from "../hooks/episodic-to-messages.js";
import type { ChatStreamItem } from "../hooks/use-streamed-send.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// ── Helpers (Mirrored from bubble-boundary-parity.test.ts) ──────────────────

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

function wrapEvents(events: EngineEvent[]): EpisodicEvent[] {
  return events.map((e, i) => toEp(0, i + 1, e));
}

async function runLive(events: EngineEvent[]): Promise<ChatStreamItem[]> {
  const allEvents: EngineEvent[] = [{ type: "user_message", content: "test" }, ...events];
  const client: PraxisClient = makeFakeClient({
    session: {
      send: vi.fn(async function* () {
        for (const e of allEvents) yield e;
      }) as unknown as PraxisClient["session"]["send"],
    } as unknown as PraxisClient["session"],
  });

  const { result } = renderHook(() => useStreamedSend(client));
  await act(async () => {
    await result.current.send(brandId<"SessionId">("s1"), "test");
  });
  return result.current.items;
}

function runReplay(events: EngineEvent[]): ChatStreamItem[] {
  const allEvents: EngineEvent[] = [{ type: "user_message", content: "test" }, ...events];
  return episodicToItems(wrapEvents(allEvents));
}

function stripIds(items: ChatStreamItem[]): unknown[] {
  return items.map((item) => {
    // Strip id from all kinds — live uses msg-N; replay uses hist-kind-N.
    const { id: _id, ...rest } = item as any;

    if (rest.kind === "message") {
      const { streaming: _streaming, ...messageRest } = rest;
      return messageRest;
    }
    if (rest.kind === "tool-entry") {
      // firstSeenAt is a wall-clock timestamp; replay sets it to 0; live sets it to Date.now().
      const { firstSeenAt: _firstSeenAt, ...toolRest } = rest;
      return toolRest;
    }
    return rest;
  });
}

// ── Bug Hunt Scenarios ───────────────────────────────────────────────────────

/** Scenario: Sub-agent spawn (requires a tool whose label has spawnsSubAgent: true) */
// Note: We need to mock getToolLabel or ensure it returns spawnsSubAgent for the tool.
vi.mock("@praxis/tools/labels", () => ({
  getToolLabel: (name: string) => {
    if (name === "spawn_agent") return { spawnsSubAgent: true, present: "Spawn" };
    return { present: name, hidden: false };
  },
}));

const SUB_AGENT_SPAWN: EngineEvent[] = [
  { type: "tool_call", toolName: "spawn_agent", args: {}, callId: "t1" },
  { type: "tool_result", callId: "t1", result: { ok: true, tier: "deterministic", value: {} } },
  { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
];

const CANCELLED_TURN: EngineEvent[] = [
  { type: "model_message", content: "Starting...", partial: true },
  { type: "interrupted", reason: "user_cancel" },
];

const THINKING_TURN: EngineEvent[] = [
  { type: "thinking", content: "Thinking deeply..." },
  { type: "model_message", content: "Answer.", partial: false },
  { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("UI/UX Bug Hunt: Live vs Replay Discrepancies", () => {
  it("FIXED: SubAgent discrepancy (SubAgentSpawn vs ToolEntryItem)", async () => {
    const live = await runLive(SUB_AGENT_SPAWN);
    const replay = runReplay(SUB_AGENT_SPAWN);

    const liveSubAgent = live.find((i) => i.kind === "sub-agent");
    const replaySubAgent = replay.find((i) => i.kind === "sub-agent");

    console.log("Live SubAgent:", liveSubAgent);
    console.log("Replay SubAgent:", replaySubAgent);

    expect(replaySubAgent).toBeDefined();
    expect(stripIds(live)).toEqual(stripIds(replay));
  });

  it("FIXED: CancelMarker discrepancy (missing in replay)", async () => {
    const live = await runLive(CANCELLED_TURN);
    const replay = runReplay(CANCELLED_TURN);

    const liveCancel = live.find((i) => i.kind === "cancel-marker");
    const replayCancel = replay.find((i) => i.kind === "cancel-marker");

    console.log("Live Cancel:", liveCancel);
    console.log("Replay Cancel:", replayCancel);

    expect(replayCancel).toBeDefined();
    expect(stripIds(live)).toEqual(stripIds(replay));
  });

  it("FIXED: Thinking discrepancy (missing in replay)", async () => {
    const live = await runLive(THINKING_TURN);
    const replay = runReplay(THINKING_TURN);

    const liveThinking = live.find((i) => i.kind === "thinking");
    const replayThinking = replay.find((i) => i.kind === "thinking");

    console.log("Live Thinking:", liveThinking);
    console.log("Replay Thinking:", replayThinking);

    expect(replayThinking).toBeDefined();
    expect(stripIds(live)).toEqual(stripIds(replay));
  });
});
