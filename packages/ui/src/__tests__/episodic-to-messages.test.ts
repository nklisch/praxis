import type { EpisodicEvent } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { episodicToMessages } from "../hooks/episodic-to-messages.js";

/** Build a minimal EpisodicEvent envelope around an EngineEvent. */
function ep(turnIndex: number, ts: number, event: EpisodicEvent["event"]): EpisodicEvent {
  return {
    id: `e${turnIndex}-${ts}` as EpisodicEvent["id"],
    sessionId: "s1" as EpisodicEvent["sessionId"],
    studentId: "stu1" as EpisodicEvent["studentId"],
    ts: ts as EpisodicEvent["ts"],
    source: { engineId: "claude-code", modeId: "teach", turnIndex },
    event,
  };
}

describe("episodicToMessages", () => {
  it("returns an empty array for no events", () => {
    expect(episodicToMessages([])).toEqual([]);
  });

  it("reconstructs a single user → assistant turn", () => {
    const out = episodicToMessages([
      ep(0, 1, { type: "user_message", content: "hello" }),
      ep(0, 2, { type: "model_message", content: "hi there", partial: false }),
      ep(0, 3, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ role: "user", content: "hello" });
    expect(out[1]).toMatchObject({
      role: "assistant",
      content: "hi there",
      streaming: false,
    });
  });

  it("collapses streaming partials into the final assembled content per turn", () => {
    const out = episodicToMessages([
      ep(0, 1, { type: "user_message", content: "hi" }),
      ep(0, 2, { type: "model_message", content: "He", partial: true }),
      ep(0, 3, { type: "model_message", content: "llo wor", partial: true }),
      // Final non-partial — should REPLACE accumulated partials, mirroring useStreamedSend.
      ep(0, 4, { type: "model_message", content: "Hello world", partial: false }),
      ep(0, 5, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const assistant = out.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("Hello world");
  });

  it("preserves multi-turn order across turn boundaries", () => {
    const out = episodicToMessages([
      ep(0, 1, { type: "user_message", content: "first" }),
      ep(0, 2, { type: "model_message", content: "first-reply", partial: false }),
      ep(0, 3, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
      ep(1, 4, { type: "user_message", content: "second" }),
      ep(1, 5, { type: "model_message", content: "second-reply", partial: false }),
      ep(1, 6, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    expect(out.map((m) => `${m.role}:${m.content}`)).toEqual([
      "user:first",
      "assistant:first-reply",
      "user:second",
      "assistant:second-reply",
    ]);
  });

  it("harvests retrieve_from_textbook citations onto the assistant message", () => {
    const out = episodicToMessages([
      ep(0, 1, { type: "user_message", content: "what does the book say about derivatives" }),
      ep(0, 2, {
        type: "tool_call",
        toolName: "retrieve_from_textbook",
        args: {},
        callId: "c1",
      }),
      ep(0, 3, {
        type: "tool_result",
        callId: "c1",
        result: {
          ok: true,
          tier: "deterministic",
          value: {
            citations: [{ documentId: "d1", page: 42, snippet: "A derivative is..." }],
          },
        },
      }),
      ep(0, 4, { type: "model_message", content: "see page 42", partial: false }),
      ep(0, 5, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const assistant = out.find((m) => m.role === "assistant");
    expect(assistant?.citations).toHaveLength(1);
    expect(assistant?.citations?.[0]).toMatchObject({ page: 42 });
  });

  it("drops historical errors instead of surfacing them as messages", () => {
    const out = episodicToMessages([
      ep(0, 1, { type: "user_message", content: "x" }),
      ep(0, 2, {
        type: "error",
        error: { code: "engine.boom", message: "old error", recoverable: false },
      }),
    ]);

    // User bubble preserved; no assistant message synthesized for the error.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ role: "user", content: "x" });
  });

  it("drops empty assistant turns (tool chatter that produced nothing renderable)", () => {
    const out = episodicToMessages([
      ep(0, 1, { type: "user_message", content: "do internal stuff" }),
      ep(0, 2, { type: "tool_call", toolName: "internal.thing", args: {}, callId: "c1" }),
      ep(0, 3, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: { irrelevant: true } },
      }),
      ep(0, 4, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    // Only the user bubble survives — the assistant turn produced no visible content.
    expect(out).toHaveLength(1);
    expect(out[0]?.role).toBe("user");
  });
});
