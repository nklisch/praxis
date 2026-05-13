import type { EpisodicEvent } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { episodicToItems } from "../hooks/episodic-to-messages.js";

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

describe("episodicToItems", () => {
  it("returns an empty array for no events", () => {
    expect(episodicToItems([])).toEqual([]);
  });

  it("reconstructs a single user → assistant turn", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "hello" }),
      ep(0, 2, { type: "model_message", content: "hi there", partial: false }),
      ep(0, 3, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "message", role: "user", content: "hello" });
    expect(out[1]).toMatchObject({
      kind: "message",
      role: "assistant",
      content: "hi there",
      streaming: false,
    });
  });

  it("collapses streaming partials into the final assembled content per turn", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "hi" }),
      ep(0, 2, { type: "model_message", content: "He", partial: true }),
      ep(0, 3, { type: "model_message", content: "llo wor", partial: true }),
      // Final non-partial — should REPLACE accumulated partials, mirroring useStreamedSend.
      ep(0, 4, { type: "model_message", content: "Hello world", partial: false }),
      ep(0, 5, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const assistant = out.find((i) => i.kind === "message" && i.role === "assistant");
    expect(assistant?.kind === "message" && assistant.content).toBe("Hello world");
  });

  it("preserves multi-turn order across turn boundaries", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "first" }),
      ep(0, 2, { type: "model_message", content: "first-reply", partial: false }),
      ep(0, 3, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
      ep(1, 4, { type: "user_message", content: "second" }),
      ep(1, 5, { type: "model_message", content: "second-reply", partial: false }),
      ep(1, 6, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const messages = out.filter((i) => i.kind === "message");
    expect(messages.map((m) => `${m.role}:${m.kind === "message" ? m.content : ""}`)).toEqual([
      "user:first",
      "assistant:first-reply",
      "user:second",
      "assistant:second-reply",
    ]);
  });

  it("harvests retrieve_from_documents citations onto the assistant message", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "what does the book say about derivatives" }),
      ep(0, 2, {
        type: "tool_call",
        toolName: "retrieve_from_documents",
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

    const assistant = out.find((i) => i.kind === "message" && i.role === "assistant");
    expect(assistant?.kind === "message" && assistant.citations).toHaveLength(1);
    if (assistant?.kind === "message") {
      expect(assistant.citations?.[0]).toMatchObject({ page: 42 });
    }
  });

  it("drops historical errors instead of surfacing them as messages", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "x" }),
      ep(0, 2, {
        type: "error",
        error: { code: "engine.boom", message: "old error", recoverable: false },
      }),
    ]);

    // User bubble preserved; no assistant message synthesized for the error.
    const messages = out.filter((i) => i.kind === "message");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: "user", content: "x" });
  });

  it("drops empty assistant turns (tool chatter that produced nothing renderable and no visible interstitial)", () => {
    // internal.thing is not in the TOOL_LABELS registry, so it gets a visible interstitial
    // via the humanizer fallback. Use a hidden tool to produce a truly empty assistant turn.
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "do internal stuff" }),
      ep(0, 2, {
        type: "tool_call",
        toolName: "flashcard.review_next",
        args: {},
        callId: "c1",
      }),
      ep(0, 3, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: { ok: true, cards: [] } },
      }),
      ep(0, 4, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    // Only the user bubble — hidden tool produces no interstitial, and no model message.
    const messages = out.filter((i) => i.kind === "message");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    // No interstitials either (hidden tool).
    const interstitials = out.filter((i) => i.kind === "interstitial");
    expect(interstitials).toHaveLength(0);
  });

  // ── Interstitial pairing ───────────────────────────────────────────────────

  it("emits a settled interstitial for a tool_call → tool_result pair", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "q" }),
      ep(0, 2, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      ep(0, 3, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      }),
      ep(0, 4, { type: "model_message", content: "Graded!", partial: false }),
      ep(0, 5, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const interstitials = out.filter((i) => i.kind === "interstitial");
    expect(interstitials).toHaveLength(1);
    const interstitial = interstitials[0];
    expect(interstitial?.kind === "interstitial" && interstitial.toolName).toBe("grade_math");
    expect(interstitial?.kind === "interstitial" && interstitial.status).toBe("settled");
    expect(interstitial?.kind === "interstitial" && interstitial.errored).toBeUndefined();
  });

  it("marks interstitial errored when tool_result.ok === false", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "q" }),
      ep(0, 2, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      ep(0, 3, {
        type: "tool_result",
        callId: "c1",
        result: { ok: false, error: { code: "tool.error", message: "boom" } },
      }),
      ep(0, 4, { type: "model_message", content: "Sorry", partial: false }),
      ep(0, 5, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const interstitials = out.filter((i) => i.kind === "interstitial");
    expect(interstitials).toHaveLength(1);
    const interstitial = interstitials[0];
    expect(interstitial?.kind === "interstitial" && interstitial.status).toBe("settled");
    expect(interstitial?.kind === "interstitial" && interstitial.errored).toBe(true);
  });

  it("correctly pairs two concurrent tool calls by callId", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "q" }),
      ep(0, 2, { type: "tool_call", toolName: "grade_math", args: {}, callId: "cA" }),
      ep(0, 3, {
        type: "tool_call",
        toolName: "retrieve_from_documents",
        args: {},
        callId: "cB",
      }),
      // Results arrive in reverse order
      ep(0, 4, {
        type: "tool_result",
        callId: "cB",
        result: {
          ok: true,
          tier: "deterministic",
          value: { citations: [{ documentId: "d1", page: 1, snippet: "s" }] },
        },
      }),
      ep(0, 5, {
        type: "tool_result",
        callId: "cA",
        result: { ok: true, tier: "deterministic", value: {} },
      }),
      ep(0, 6, { type: "model_message", content: "Done", partial: false }),
      ep(0, 7, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const interstitials = out.filter((i) => i.kind === "interstitial");
    expect(interstitials).toHaveLength(2);

    const gradeInterstitial = interstitials.find(
      (i) => i.kind === "interstitial" && i.toolName === "grade_math",
    );
    const retrieveInterstitial = interstitials.find(
      (i) => i.kind === "interstitial" && i.toolName === "retrieve_from_documents",
    );

    expect(gradeInterstitial?.kind === "interstitial" && gradeInterstitial.status).toBe("settled");
    expect(retrieveInterstitial?.kind === "interstitial" && retrieveInterstitial.status).toBe(
      "settled",
    );

    // Citations should land on the assistant message
    const assistant = out.find((i) => i.kind === "message" && i.role === "assistant");
    expect(assistant?.kind === "message" && assistant.citations).toHaveLength(1);
  });

  it("does not emit interstitial for hidden tools (flashcard.review_next) but still harvests dueCards", () => {
    const cards = [{ flashcardId: "f1", front: "Q" }];
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "show cards" }),
      ep(0, 2, { type: "tool_call", toolName: "flashcard.review_next", args: {}, callId: "c1" }),
      ep(0, 3, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: { ok: true, cards } },
      }),
      ep(0, 4, { type: "model_message", content: "Here are your cards", partial: false }),
      ep(0, 5, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    // No interstitial for hidden tool
    const interstitials = out.filter((i) => i.kind === "interstitial");
    expect(interstitials).toHaveLength(0);

    // dueCards still harvested onto assistant message
    const assistant = out.find((i) => i.kind === "message" && i.role === "assistant");
    expect(assistant?.kind === "message" && assistant.dueCards).toHaveLength(1);
  });

  // ── Bubble-splitting (Unit 2) ─────────────────────────────────────────────────

  it("tool_call between two model_messages produces two assistant bubbles in correct order", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "q" }),
      ep(0, 2, { type: "model_message", content: "A", partial: false }),
      ep(0, 3, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      ep(0, 4, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      }),
      ep(0, 5, { type: "model_message", content: "B", partial: false }),
      ep(0, 6, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const assistantMsgs = out.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistantMsgs).toHaveLength(2);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("A");
    expect(assistantMsgs[1]?.kind === "message" && assistantMsgs[1].content).toBe("B");
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].streaming).toBe(false);
    expect(assistantMsgs[1]?.kind === "message" && assistantMsgs[1].streaming).toBe(false);

    // Interstitial sits between the two bubbles in item order.
    const assistantIdx0 = out.findIndex((i) => i.kind === "message" && i.role === "assistant");
    const interstitialIdx = out.findIndex((i) => i.kind === "interstitial");
    const assistantIdx1 = out.findLastIndex((i) => i.kind === "message" && i.role === "assistant");
    expect(interstitialIdx).toBeGreaterThan(assistantIdx0);
    expect(assistantIdx1).toBeGreaterThan(interstitialIdx);
  });

  it("tool_call with no following model_message produces one bubble and no trailing empty bubble", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "q" }),
      ep(0, 2, { type: "model_message", content: "Let me check.", partial: false }),
      ep(0, 3, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      ep(0, 4, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, tier: "deterministic", value: {} },
      }),
      ep(0, 5, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const assistantMsgs = out.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("Let me check.");
  });

  it("system_note closes bubble without pushing an item", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "q" }),
      ep(0, 2, { type: "model_message", content: "A", partial: false }),
      ep(0, 3, {
        type: "system_note",
        content: "child session submitted",
        origin: "parent_session",
      }),
      ep(0, 4, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    // One assistant bubble ("A"); system_note is UI-invisible.
    const assistantMsgs = out.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("A");
    const msgItems = out.filter((i) => i.kind === "message");
    expect(msgItems).toHaveLength(2); // user + assistant
  });

  it("partials-with-non-partial-seal produces one bubble (non-partial replaces accumulated content)", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "q" }),
      ep(0, 2, { type: "model_message", content: "He", partial: true }),
      ep(0, 3, { type: "model_message", content: "llo wor", partial: true }),
      ep(0, 4, { type: "model_message", content: "Hello world", partial: false }),
      ep(0, 5, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const assistantMsgs = out.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].content).toBe("Hello world");
  });

  // ── Unit 3: renderable-result placement (replay side) ────────────────────────

  it("citations attach to the bubble AFTER the tool resolves, not the bubble before", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "what does the book say" }),
      ep(0, 2, { type: "model_message", content: "Let me look.", partial: false }),
      ep(0, 3, {
        type: "tool_call",
        toolName: "retrieve_from_documents",
        args: {},
        callId: "c1",
      }),
      ep(0, 4, {
        type: "tool_result",
        callId: "c1",
        result: {
          ok: true,
          tier: "deterministic",
          value: { citations: [{ documentId: "d1", page: 42, snippet: "A derivative is..." }] },
        },
      }),
      ep(0, 5, { type: "model_message", content: "Found it on page 42.", partial: false }),
      ep(0, 6, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const assistantMsgs = out.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistantMsgs).toHaveLength(2);
    // Bubble A (pre-tool) has no citations.
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].citations).toBeUndefined();
    // Bubble B (post-tool) has citations.
    expect(assistantMsgs[1]?.kind === "message" && assistantMsgs[1].citations).toHaveLength(1);
  });

  it("citations fall back to the most-recent bubble when stream ends without another model_message", () => {
    const out = episodicToItems([
      ep(0, 1, { type: "user_message", content: "find something" }),
      ep(0, 2, { type: "model_message", content: "Let me look.", partial: false }),
      ep(0, 3, {
        type: "tool_call",
        toolName: "retrieve_from_documents",
        args: {},
        callId: "c1",
      }),
      ep(0, 4, {
        type: "tool_result",
        callId: "c1",
        result: {
          ok: true,
          tier: "deterministic",
          value: { citations: [{ documentId: "d1", page: 10, snippet: "..." }] },
        },
      }),
      ep(0, 5, { type: "final", usage: { inputTokens: 0, outputTokens: 0 } }),
    ]);

    const assistantMsgs = out.filter((i) => i.kind === "message" && i.role === "assistant");
    expect(assistantMsgs).toHaveLength(1);
    // Citations fall back to the only (pre-tool) bubble.
    expect(assistantMsgs[0]?.kind === "message" && assistantMsgs[0].citations).toHaveLength(1);
  });
});
