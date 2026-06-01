import type { Note, ProposedCourse, RetrievalCitation, Timestamp } from "@praxis/core/types";
import { getToolLabel } from "@praxis/tools/labels";
import { useRef } from "react";
import type { ReviewCard } from "../components/flashcard-review.js";
import type { BubbleRenderables } from "./use-streamed-bubbles.js";
import type { ChatStreamItem } from "./use-streamed-send.js";

/** Minimum time (ms) a tool-entry interstitial must remain visible before settling. */
export const MIN_INTERSTITIAL_VISIBLE_MS = 800;

/**
 * Setter for the items list — matches the React `useState` dispatch signature
 * so stable `setItems` from `useStreamedSend` can be passed directly.
 */
type SetItems = (updater: (prev: ChatStreamItem[]) => ChatStreamItem[]) => void;

/** Shape of a tool_call event (subset of EngineEvent used in this hook). */
interface ToolCallEvent {
  type: "tool_call";
  toolName: string;
  args: unknown;
  callId: string;
}

/** Shape of a tool_result event (subset of EngineEvent used in this hook). */
interface ToolResultEvent {
  type: "tool_result";
  callId: string;
  result:
    | { ok: true; tier?: string; value: unknown }
    | { ok: false; error: { code: string; message: string; recoverable?: boolean } };
}

/** Per-timer entry stored in the pending settle map. */
interface SettleTimer {
  timer: ReturnType<typeof setTimeout>;
  settleNow: () => void;
}

/** Per-turn mutable locals stored in a single ref to avoid re-renders. */
interface InterstitialRef {
  /** callId → toolName. Tracks all pending tool calls (including hidden ones). */
  pendingByCallId: Map<string, string>;
  /** callId → Date.now() when the interstitial was first pushed (visible tools only). */
  interstitialFirstSeenAt: Map<string, number>;
  /** callId → { timer, settleNow }. Pending pacing timers awaiting MIN_INTERSTITIAL_VISIBLE_MS. */
  pendingSettleTimers: Map<string, SettleTimer>;
  /** Renderable results not yet attached to a bubble. */
  pendingCitations: RetrievalCitation[];
  pendingDrafts: ProposedCourse[];
  pendingNotes: Note[];
  pendingDueCards: ReviewCard[];
}

/** Public API returned by `useInterstitialLifecycle`. */
export interface InterstitialApi {
  /**
   * Register a tool_call. Pushes a visible tool-entry or sub-agent item into
   * the item list. Hidden tools (label.hidden) get no item but are still
   * tracked in pendingByCallId for result harvesting.
   */
  onToolCall: (event: ToolCallEvent, setItems: SetItems) => void;
  /**
   * Register a tool_result. Settles sub-agent items immediately (no pacing),
   * then settles or schedules settle of the matching tool-entry with pacing,
   * and harvests renderable results (citations, drafts, notes, dueCards) into
   * the pending accumulator. Returns the newly harvested renderables so the
   * caller can attach them to a bubble that opens in the same event batch.
   */
  onToolResult: (event: ToolResultEvent, setItems: SetItems) => BubbleRenderables;
  /**
   * True when a tool_result can be paired with a tool_call seen in this turn.
   */
  isToolResultExpected: (callId: string) => boolean;
  /**
   * Called on `interrupted`. Clears all pending pacing timers without firing
   * settleNow — cancelled turns leave in_flight interstitials as-is per spec.
   */
  onInterrupted: () => void;
  /**
   * Called in the `finally` block. Drains all remaining pacing timers by
   * firing settleNow() immediately (the timer is cancelled first to prevent
   * double-fire). Then merges any unattached renderable results into the
   * bubble identified by `lastBubbleId` (the most-recent assistant bubble).
   * If `lastBubbleId` is null, leftover renderables are silently dropped.
   */
  drainOnFinally: (lastBubbleId: string | null, setItems: SetItems) => void;
  /**
   * Snapshot of accumulated renderables not yet attached to a bubble.
   * Read-only; use `drainRenderables()` to consume them.
   */
  readonly pendingRenderables: BubbleRenderables;
  /**
   * Consume (drain) all pending renderables, returning them and clearing the
   * internal accumulator. Called by the bubble hook's `openAssistantBubble`
   * site to attach renderables to the new bubble.
   */
  drainRenderables: () => BubbleRenderables;
  /**
   * Reset all per-turn state. Call at the start of each `send()` turn before
   * the try block. Cancels any orphaned timers from a previous turn.
   */
  reset: () => void;
}

function emptyRef(): InterstitialRef {
  return {
    pendingByCallId: new Map(),
    interstitialFirstSeenAt: new Map(),
    pendingSettleTimers: new Map(),
    pendingCitations: [],
    pendingDrafts: [],
    pendingNotes: [],
    pendingDueCards: [],
  };
}

/**
 * Manages tool-call interstitial tracking, pacing timers, sub-agent settle,
 * and renderable-result harvesting for a streaming turn.
 *
 * All per-turn mutable state lives in a single `useRef`-held object, reset
 * via `reset()` at the start of each turn. `setItems` is accepted at each
 * call site (not captured at construction) to prevent stale-closure issues
 * with async timer callbacks.
 *
 * Timer lifecycle:
 * - `onInterrupted()` cancels all pending timers without firing settle
 *   (leaves in_flight interstitials as-is per the cancel spec).
 * - `drainOnFinally()` cancels each timer and fires settle synchronously so
 *   fast tools are settled before the turn's state is torn down.
 * - `reset()` cancels any orphaned timers from the previous turn.
 */
export function useInterstitialLifecycle(): InterstitialApi {
  const ref = useRef<InterstitialRef>(emptyRef());

  const reset = (): void => {
    // Cancel any orphaned timers from the previous turn before discarding state.
    for (const { timer } of ref.current.pendingSettleTimers.values()) {
      clearTimeout(timer);
    }
    ref.current = emptyRef();
  };

  const onToolCall = (event: ToolCallEvent, setItems: SetItems): void => {
    const { toolName, callId, args } = event;
    const state = ref.current;

    // Always track in pendingByCallId — even hidden tools need result harvesting.
    state.pendingByCallId.set(callId, toolName);

    const label = getToolLabel(toolName);

    if (label.spawnsSubAgent === true) {
      // Promote to a sub-agent block — subscribes to client.subAgent.events
      // rather than showing a static tool entry. No pacing timer applied.
      setItems((prev) => [...prev, { kind: "sub-agent", callId, toolName, status: "in_flight" }]);
    } else if (!label.hidden) {
      // Push a visible tool-entry item for this tool call.
      const firstSeenAt = Date.now();
      state.interstitialFirstSeenAt.set(callId, firstSeenAt);
      setItems((prev) => [
        ...prev,
        {
          kind: "tool-entry",
          callId,
          toolName,
          status: "in_flight",
          firstSeenAt,
          input: args,
        },
      ]);
    }
  };

  const onToolResult = (event: ToolResultEvent, setItems: SetItems): BubbleRenderables => {
    const { callId, result } = event;
    const state = ref.current;

    const toolName = state.pendingByCallId.get(callId);
    if (toolName === undefined) {
      console.warn(`[useInterstitialLifecycle] Unmatched tool_result for callId=${callId}`);
      return {};
    }

    state.pendingByCallId.delete(callId);

    const isErrored = result.ok === false;
    const outputValue = result.ok ? result.value : undefined;
    const errorMsg = result.ok === false ? result.error.message : undefined;

    // Settle sub-agent items immediately (no pacing — the sub-agent block has
    // its own live event stream; the settle just marks the parent call done).
    setItems((prev) =>
      prev.map((it) => {
        if (it.kind === "sub-agent" && it.callId === callId) {
          return {
            ...it,
            status: "settled" as const,
            ...(isErrored && { errored: true }),
          };
        }
        return it;
      }),
    );

    // Settle any visible tool-entry with this callId, pacing to MIN_INTERSTITIAL_VISIBLE_MS.
    const seenAt = state.interstitialFirstSeenAt.get(callId);

    // The settleNow closure captures all the values it needs at tool_result time.
    // setItems is the stable React dispatch — safe to capture here.
    const settleNow = (): void => {
      setItems((prev) =>
        prev.map((it) => {
          if (it.kind === "tool-entry" && it.callId === callId) {
            return {
              ...it,
              status: (isErrored ? "errored" : "settled") as "errored" | "settled",
              ...(outputValue !== undefined && { output: outputValue }),
              ...(errorMsg !== undefined && { errorMessage: errorMsg }),
            };
          }
          return it;
        }),
      );
      state.pendingSettleTimers.delete(callId);
      state.interstitialFirstSeenAt.delete(callId);
    };

    if (seenAt !== undefined) {
      const elapsed = Date.now() - seenAt;
      if (elapsed >= MIN_INTERSTITIAL_VISIBLE_MS) {
        settleNow();
      } else {
        const timer = setTimeout(settleNow, MIN_INTERSTITIAL_VISIBLE_MS - elapsed);
        state.pendingSettleTimers.set(callId, { timer, settleNow });
      }
    }

    // Harvest renderable results into the pending accumulators (Unit 3).
    // They drain into the FIRST bubble that opens after this result.
    const harvested: BubbleRenderables = {};

    if (result.ok) {
      if (toolName === "retrieve_from_documents") {
        const value = result.value as { citations?: RetrievalCitation[] } | undefined;
        if (value?.citations && Array.isArray(value.citations)) {
          const citations = value.citations as RetrievalCitation[];
          state.pendingCitations.push(...citations);
          harvested.citations = [...citations];
        }
      } else if (toolName === "course.show_draft") {
        const value = result.value as
          | { kind: "ok"; draft: { proposed: ProposedCourse } }
          | { kind: "not_found" }
          | undefined;
        if (value?.kind === "ok" && value.draft?.proposed) {
          const draft = value.draft.proposed;
          state.pendingDrafts.push(draft);
          harvested.drafts = [draft];
        }
      } else if (toolName === "note.show") {
        const value = result.value as
          | { kind: "ok"; note: Note }
          | { kind: "not_found" }
          | undefined;
        if (value?.kind === "ok" && value.note) {
          const note = value.note;
          state.pendingNotes.push(note);
          harvested.notes = [note];
        }
      } else if (toolName === "flashcard.review_next") {
        const value = result.value as
          | {
              ok: true;
              cards: Array<{
                flashcardId: string;
                front: string;
                conceptId?: string;
                preview?: {
                  again: { nextReviewAt: Timestamp };
                  hard: { nextReviewAt: Timestamp };
                  good: { nextReviewAt: Timestamp };
                  easy: { nextReviewAt: Timestamp };
                };
              }>;
            }
          | undefined;
        if (value?.ok && Array.isArray(value.cards)) {
          const cards = value.cards as ReviewCard[];
          state.pendingDueCards.push(...cards);
          harvested.dueCards = [...cards];
        }
      }
    }

    return harvested;
  };

  const isToolResultExpected = (callId: string): boolean => {
    return ref.current.pendingByCallId.has(callId);
  };

  const onInterrupted = (): void => {
    // Clear pacing timers without settling — cancelled turns leave interstitials
    // in_flight per spec (the turn is gone; the unsettled state is intentional).
    for (const { timer } of ref.current.pendingSettleTimers.values()) {
      clearTimeout(timer);
    }
    ref.current.pendingSettleTimers.clear();
  };

  const drainOnFinally = (lastBubbleId: string | null, setItems: SetItems): void => {
    const state = ref.current;

    // Drain any remaining pending settle timers by firing them immediately.
    // (onInterrupted clears them on cancel; any remaining here are from normal
    // completion where tool_result arrived but the pacing timer hasn't fired
    // yet — settle them now so no dangling in_flight items remain.)
    for (const { timer, settleNow } of state.pendingSettleTimers.values()) {
      clearTimeout(timer);
      settleNow();
    }
    state.pendingSettleTimers.clear();

    // Drain any remaining pending renderables into the most-recent assistant
    // bubble (fallback for the case where a tool was the last thing in the stream).
    if (
      lastBubbleId !== null &&
      (state.pendingCitations.length > 0 ||
        state.pendingDrafts.length > 0 ||
        state.pendingNotes.length > 0 ||
        state.pendingDueCards.length > 0)
    ) {
      const targetId = lastBubbleId;
      const citations = state.pendingCitations.length > 0 ? [...state.pendingCitations] : undefined;
      const drafts = state.pendingDrafts.length > 0 ? [...state.pendingDrafts] : undefined;
      const notes = state.pendingNotes.length > 0 ? [...state.pendingNotes] : undefined;
      const dueCards = state.pendingDueCards.length > 0 ? [...state.pendingDueCards] : undefined;

      setItems((prev) =>
        prev.map((it) => {
          if (it.kind === "message" && it.id === targetId) {
            return {
              ...it,
              ...(citations && { citations: [...(it.citations ?? []), ...citations] }),
              ...(drafts && { drafts: [...(it.drafts ?? []), ...drafts] }),
              ...(notes && { notes: [...(it.notes ?? []), ...notes] }),
              ...(dueCards && { dueCards: [...(it.dueCards ?? []), ...dueCards] }),
            };
          }
          return it;
        }),
      );

      // Clear the accumulators now that they've been drained.
      state.pendingCitations.length = 0;
      state.pendingDrafts.length = 0;
      state.pendingNotes.length = 0;
      state.pendingDueCards.length = 0;
    }
  };

  const drainRenderables = (): BubbleRenderables => {
    const state = ref.current;
    const result: BubbleRenderables = {};

    if (state.pendingCitations.length > 0) {
      result.citations = [...state.pendingCitations];
      state.pendingCitations.length = 0;
    }
    if (state.pendingDrafts.length > 0) {
      result.drafts = [...state.pendingDrafts];
      state.pendingDrafts.length = 0;
    }
    if (state.pendingNotes.length > 0) {
      result.notes = [...state.pendingNotes];
      state.pendingNotes.length = 0;
    }
    if (state.pendingDueCards.length > 0) {
      result.dueCards = [...state.pendingDueCards];
      state.pendingDueCards.length = 0;
    }

    return result;
  };

  return {
    onToolCall,
    onToolResult,
    isToolResultExpected,
    onInterrupted,
    drainOnFinally,
    drainRenderables,
    get pendingRenderables(): BubbleRenderables {
      const state = ref.current;
      const result: BubbleRenderables = {};
      if (state.pendingCitations.length > 0) result.citations = [...state.pendingCitations];
      if (state.pendingDrafts.length > 0) result.drafts = [...state.pendingDrafts];
      if (state.pendingNotes.length > 0) result.notes = [...state.pendingNotes];
      if (state.pendingDueCards.length > 0) result.dueCards = [...state.pendingDueCards];
      return result;
    },
    reset,
  };
}
