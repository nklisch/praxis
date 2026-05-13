import type {
  EngineEvent,
  EpisodicEvent,
  Note,
  PraxisClient,
  ProposedCourse,
  RetrievalCitation,
  SessionId,
  Timestamp,
} from "@praxis/core/types";
import { getToolLabel } from "@praxis/tools/labels";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewCard } from "../components/flashcard-review.js";
import { episodicToItems } from "./episodic-to-messages.js";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /**
   * Settled content — mirrors `rawContent` during streaming, stays as the
   * final assembled string once streaming ends. Consumers that don't use the
   * eased-stream hook can read this directly.
   */
  content: string;
  /**
   * Raw content as it arrives off the wire, updated on every streaming delta.
   * `<MessageBubble>` feeds this into `useEasedStream` while `streaming` is
   * true to pace the visual release. For user messages, `rawContent === content`
   * (user bubbles are never streamed).
   */
  rawContent: string;
  streaming?: boolean;
  /** Citations from retrieve_from_documents tool calls in this message. */
  citations?: RetrievalCitation[];
  /** Draft courses from course.show_draft tool calls in this message. */
  drafts?: ProposedCourse[];
  /** Notes from note.show tool calls in this message. */
  notes?: Note[];
  /** Due cards from flashcard.review_next tool calls in this message. */
  dueCards?: ReviewCard[];
}

/**
 * @deprecated Use `ToolEntryItem` instead. Kept temporarily for type compatibility
 * during the rename transition — will be removed once all consumers are updated.
 */
export type ToolInterstitial = ToolEntryItem;

export interface ToolEntryItem {
  /** EngineEvent.callId — pairs tool_call with tool_result. */
  callId: string;
  toolName: string;
  /** "in_flight" while awaiting tool_result; "settled" once it lands; "errored" when ok===false. */
  status: "in_flight" | "settled" | "errored";
  /**
   * Tool input (args) — populated at tool_call time.
   * Available for both live stream and episodic replay.
   */
  input?: unknown;
  /**
   * Tool result value — populated at tool_result time.
   * Only present when status === "settled".
   */
  output?: unknown;
  /**
   * Error message — populated when status === "errored".
   */
  errorMessage?: string;
  /** Wall-clock timestamp when this entry first appeared. Used to enforce MIN_INTERSTITIAL_VISIBLE_MS. */
  firstSeenAt: number;
}

/** Minimum time (ms) an interstitial must remain visible before settling. */
const MIN_INTERSTITIAL_VISIBLE_MS = 800;

export interface ReasoningItem {
  id: string;
  /** Cumulative thinking content captured since this block opened. */
  content: string;
  /** True while thinking events for THIS block are still arriving. */
  streaming: boolean;
}

/** Synthetic item appended when a turn is cancelled via the interrupted event. */
export interface CancelMarker {
  id: string;
}

/**
 * A sub-agent spawn item — promoted from a `tool_call` whose label has
 * `spawnsSubAgent: true`. Rather than showing as a standard `<ToolInterstitial>`,
 * this item renders as `<SubAgentBlock>` which subscribes to
 * `client.subAgent.events({ parentCallId })` and shows live step progress.
 *
 * The pacing logic (MIN_INTERSTITIAL_VISIBLE_MS) is NOT applied to sub-agent
 * items — they have their own event stream for progress; the settle transition
 * just mirrors the parent `tool_result`.
 */
export interface SubAgentSpawn {
  /** Parent session's tool_call.callId — subscription key for the sub-agent stream. */
  callId: string;
  toolName: string;
  /** "in_flight" while awaiting tool_result; "settled" once the result lands. */
  status: "in_flight" | "settled";
  /** True when the matched tool_result.ok === false. */
  errored?: boolean;
}

/**
 * A message that has been submitted while the engine is streaming and is
 * waiting in the queue. Renders inline as a faded "pending" bubble. Never
 * persisted to episodic — pure UI state, dropped on app restart.
 */
export interface PendingMessageItem {
  kind: "pending-message";
  id: string;
  role: "user";
  content: string;
  sketchId?: string;
}

export type ChatStreamItem =
  | ({ kind: "message" } & ChatMessage)
  | ({ kind: "tool-entry" } & ToolEntryItem)
  | ({ kind: "sub-agent" } & SubAgentSpawn)
  | ({ kind: "thinking" } & ReasoningItem)
  | ({ kind: "cancel-marker" } & CancelMarker)
  | PendingMessageItem;

export interface UseStreamedSendResult {
  items: ChatStreamItem[];
  isStreaming: boolean;
  /** True when the engine is working but has not yet emitted assistant text in the current segment. */
  thinking: boolean;
  lastError: string | null;
  send: (sessionId: SessionId, message: string, sketchId?: string) => Promise<void>;
  /**
   * Cancel the in-flight turn. No-op if not currently streaming.
   * Triggers iterator.return() which fires the praxis.session.send.cancel IPC channel.
   * Per the queue design: cancel preserves pending messages rather than
   * flushing them — the user signalled intent to stop this turn, so the
   * pending queue stays visible until the user removes or flushes manually.
   */
  cancel: () => void;
  /**
   * Remove a specific pending message from the queue and from the item list.
   * No-op if the id is not found.
   */
  cancelPending: (pendingId: string) => void;
  /** Number of messages currently waiting in the queue (0 when nothing pending). */
  pendingCount: number;
  clearMessages: () => void;
  /**
   * Load the persisted transcript for an existing session and replace the
   * local item log with it. Call once per session-id on mount so the user
   * sees their prior conversation when re-opening a tab or relaunching the
   * app. No-op while a turn is mid-stream — replacing items then would
   * lose the in-flight assistant bubble. Errors are reported via `lastError`
   * so the chat UI can surface them in its existing error banner.
   */
  loadHistory: (sessionId: SessionId) => Promise<void>;
}

let msgCounter = 0;
function nextId(): string {
  return `msg-${++msgCounter}`;
}

/** A pending message waiting in the queue to be sent once the current turn ends. */
interface PendingMessage {
  id: string;
  content: string;
  sketchId?: string;
}

export function useStreamedSend(client: PraxisClient): UseStreamedSendResult {
  const [items, setItems] = useState<ChatStreamItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // ── Pending queue ─────────────────────────────────────────────────────────────
  // Messages submitted while isStreaming is true land here and flush after the
  // current turn ends (unless the user clicked Stop).
  const [pendingQueue, setPendingQueue] = useState<PendingMessage[]>([]);
  // Ref mirror so the finally block always reads the latest value without
  // depending on stale closure capture from the start of the send() call.
  const pendingQueueRef = useRef<PendingMessage[]>([]);
  useEffect(() => {
    pendingQueueRef.current = pendingQueue;
  }, [pendingQueue]);

  // Tracks whether the current cancel was user-initiated. Set in cancel()
  // before .return(), cleared at the start of send(). The finally block
  // reads this to decide whether to auto-flush pending messages.
  const userCancelledRef = useRef(false);

  // Ref to the active iterator so cancel() can call .return() from outside the send closure.
  const iteratorRef = useRef<AsyncIterator<EngineEvent> | null>(null);

  const cancel = useCallback((): void => {
    // Mark user-initiated before .return() so the finally block can detect it.
    userCancelledRef.current = true;
    iteratorRef.current?.return?.();
  }, []);

  const cancelPending = useCallback((pendingId: string): void => {
    setPendingQueue((prev) => prev.filter((p) => p.id !== pendingId));
    setItems((prev) =>
      prev.filter((it) => !(it.kind === "pending-message" && it.id === pendingId)),
    );
  }, []);

  const send = async (sessionId: SessionId, message: string, sketchId?: string): Promise<void> => {
    if (isStreaming) {
      // Queue instead of dropping. The pending bubble renders inline in the
      // thread at the position it will occupy when the turn flushes.
      const pendingId = nextId();
      const entry: PendingMessage = { id: pendingId, content: message };
      if (sketchId !== undefined) entry.sketchId = sketchId;
      setPendingQueue((prev) => [...prev, entry]);
      setItems((prev) => [
        ...prev,
        {
          kind: "pending-message",
          id: pendingId,
          role: "user",
          content: message,
          ...(sketchId !== undefined && { sketchId }),
        } satisfies PendingMessageItem,
      ]);
      return;
    }

    // Clear the user-cancelled flag at the start of a new turn so retry works.
    userCancelledRef.current = false;
    setLastError(null);

    // Immediately add user bubble to local state.
    const userMsgId = nextId();
    setItems((prev) => [
      ...prev,
      { kind: "message", id: userMsgId, role: "user", content: message, rawContent: message },
    ]);

    // Assistant bubbles open lazily — the first model_message of the turn
    // triggers openAssistantBubble(). This removes the empty placeholder that
    // used to appear before any text arrived. The isStreaming flag + any
    // in-flight interstitial are the user-visible "working" signals.

    setIsStreaming(true);
    setThinking(true);

    // Per-bubble content accumulator. Reset on every openAssistantBubble().
    let activeBubbleContent = "";
    // Pointer to the currently open assistant bubble id (null = no open bubble).
    let currentAssistantId: string | null = null;
    // Most recent assistant bubble id (for end-of-stream renderable fallback).
    let lastAssistantId: string | null = null;

    // Track pending tool calls by callId → toolName (supports concurrent fan-out).
    const pendingByCallId = new Map<string, string>();

    // Track when each visible interstitial was first pushed (callId → Date.now()).
    // Mirrors the firstSeenAt field in ToolInterstitial but stored in JS (no React state read).
    const interstitialFirstSeenAt = new Map<string, number>();

    // Pending settle timers — cleared on interrupted / error / finally to avoid leaks.
    // Value is { timer, settleNow } so the finally drain can invoke settleNow directly.
    const pendingSettleTimers = new Map<
      string,
      { timer: ReturnType<typeof setTimeout>; settleNow: () => void }
    >();

    // Active reasoning block id (null = no open block).
    let currentReasoningId: string | null = null;

    // Pending renderable results — drained into the FIRST bubble that opens
    // after the tool resolves. If the stream ends with no subsequent bubble,
    // they drain into the most-recent assistant bubble.
    const pendingCitations: RetrievalCitation[] = [];
    const pendingDrafts: ProposedCourse[] = [];
    const pendingNotes: Note[] = [];
    const pendingDueCards: ReviewCard[] = [];

    /** Open a new assistant bubble, draining any pending renderables into it. */
    const openAssistantBubble = (): string => {
      const id = nextId();
      activeBubbleContent = "";
      // Drain pending renderables into this new bubble (Unit 3 placement rule:
      // renderables attach to the FIRST bubble after the tool resolves).
      const hasCitations = pendingCitations.length > 0;
      const hasDrafts = pendingDrafts.length > 0;
      const hasNotes = pendingNotes.length > 0;
      const hasDueCards = pendingDueCards.length > 0;
      const newBubble: ChatStreamItem = {
        kind: "message",
        id,
        role: "assistant",
        content: "",
        rawContent: "",
        streaming: true,
        ...(hasCitations && { citations: [...pendingCitations] }),
        ...(hasDrafts && { drafts: [...pendingDrafts] }),
        ...(hasNotes && { notes: [...pendingNotes] }),
        ...(hasDueCards && { dueCards: [...pendingDueCards] }),
      };
      if (hasCitations) pendingCitations.length = 0;
      if (hasDrafts) pendingDrafts.length = 0;
      if (hasNotes) pendingNotes.length = 0;
      if (hasDueCards) pendingDueCards.length = 0;
      setItems((prev) => [...prev, newBubble]);
      currentAssistantId = id;
      lastAssistantId = id;
      return id;
    };

    /** Close the current assistant bubble (no-op if already closed). */
    const closeAssistantBubble = (): void => {
      if (currentAssistantId === null) return;
      const id = currentAssistantId;
      currentAssistantId = null;
      setItems((prev) =>
        prev.map((it) =>
          it.kind === "message" && it.id === id ? { ...it, streaming: false } : it,
        ),
      );
    };

    /** Close the active reasoning block (no-op if none open). Marks streaming: false; keeps item in list. */
    const closeReasoningBlock = (): void => {
      if (currentReasoningId === null) return;
      const id = currentReasoningId;
      currentReasoningId = null;
      setItems((prev) =>
        prev.map((it) =>
          it.kind === "thinking" && it.id === id ? { ...it, streaming: false } : it,
        ),
      );
    };

    try {
      const stream = client.session.send(sessionId, message);
      const iter = stream[Symbol.asyncIterator]();
      iteratorRef.current = iter;

      while (true) {
        const r = await iter.next();
        if (r.done) break;
        const event = r.value;

        // Ignore user_message events — user bubble already in local state.
        if (event.type === "user_message") continue;

        if (event.type === "thinking") {
          if (currentReasoningId === null) {
            // Open a new reasoning block.
            const id = nextId();
            currentReasoningId = id;
            setItems((prev) => [
              ...prev,
              { kind: "thinking", id, content: event.content, streaming: true },
            ]);
          } else {
            // Append to the active reasoning block.
            const id = currentReasoningId;
            setItems((prev) =>
              prev.map((it) =>
                it.kind === "thinking" && it.id === id
                  ? { ...it, content: it.content + event.content }
                  : it,
              ),
            );
          }
          continue;
        }

        if (event.type === "model_message") {
          // Close any open reasoning block — text begins.
          closeReasoningBlock();
          // First model_message of this segment — we're no longer just thinking.
          setThinking(false);

          // Lazily open a bubble on the first model_message of this "run".
          if (currentAssistantId === null) {
            openAssistantBubble();
          }
          if (event.partial === true) {
            // Streaming delta — append to running content.
            activeBubbleContent += event.content;
          } else {
            // Final non-partial — this is the assembled content for the turn.
            activeBubbleContent = event.content;
          }
          // Capture both id and content as local consts so the setItems closure
          // doesn't close over mutable variables — by the time React flushes
          // the update, activeBubbleContent may have advanced to the next bubble.
          const id = currentAssistantId; // stable for the closure
          const contentSnapshot = activeBubbleContent; // snapshot, not ref
          setItems((prev) =>
            prev.map((it) =>
              it.kind === "message" && it.id === id
                ? { ...it, content: contentSnapshot, rawContent: contentSnapshot, streaming: true }
                : it,
            ),
          );
          if (event.partial !== true) {
            // Non-partial seals this bubble; next model_message opens a new one.
            closeAssistantBubble();
          }
        } else if (event.type === "tool_call") {
          // tool_call is a bubble boundary — close whatever is open.
          closeAssistantBubble();
          closeReasoningBlock();

          const { toolName, callId } = event;
          // Always track in pendingByCallId for result harvesting (even hidden tools).
          pendingByCallId.set(callId, toolName);

          const label = getToolLabel(toolName);
          if (label.spawnsSubAgent === true) {
            // Promote to a sub-agent block — subscribes to client.subAgent.events
            // rather than showing a static tool entry. No pacing timer applied.
            setItems((prev) => [
              ...prev,
              { kind: "sub-agent", callId, toolName, status: "in_flight" },
            ]);
          } else if (!label.hidden) {
            // Push a visible tool entry item for this tool call.
            const firstSeenAt = Date.now();
            interstitialFirstSeenAt.set(callId, firstSeenAt);
            setItems((prev) => [
              ...prev,
              {
                kind: "tool-entry",
                callId,
                toolName,
                status: "in_flight",
                firstSeenAt,
                input: event.args,
              },
            ]);
          }
        } else if (event.type === "tool_result") {
          // After a tool_result, we're back to thinking until the next model_message.
          setThinking(true);

          const { callId } = event;
          const toolName = pendingByCallId.get(callId);
          if (toolName === undefined) {
            console.warn(`[useStreamedSend] Unmatched tool_result for callId=${callId}`);
          } else {
            pendingByCallId.delete(callId);

            const isErrored = event.result.ok === false;
            const outputValue = event.result.ok ? event.result.value : undefined;
            const errorMsg = event.result.ok === false ? event.result.error.message : undefined;

            // Settle sub-agent items immediately (no pacing — the sub-agent block
            // has its own live event stream; the settle just marks the parent call done).
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

            // Settle any visible tool entry with this callId, pacing to MIN_INTERSTITIAL_VISIBLE_MS.
            const seenAt = interstitialFirstSeenAt.get(callId);
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
              pendingSettleTimers.delete(callId);
              interstitialFirstSeenAt.delete(callId);
            };

            if (seenAt !== undefined) {
              const elapsed = Date.now() - seenAt;
              if (elapsed >= MIN_INTERSTITIAL_VISIBLE_MS) {
                settleNow();
              } else {
                const timer = setTimeout(settleNow, MIN_INTERSTITIAL_VISIBLE_MS - elapsed);
                pendingSettleTimers.set(callId, { timer, settleNow });
              }
            }

            // Harvest renderable results into pending arrays (Unit 3).
            // They will drain into the FIRST bubble that opens after this result.
            if (event.result.ok) {
              if (toolName === "retrieve_from_documents") {
                const value = event.result.value as { citations?: RetrievalCitation[] } | undefined;
                if (value?.citations && Array.isArray(value.citations)) {
                  pendingCitations.push(...(value.citations as RetrievalCitation[]));
                }
              } else if (toolName === "course.show_draft") {
                const value = event.result.value as
                  | { kind: "ok"; draft: { proposed: ProposedCourse } }
                  | { kind: "not_found" }
                  | undefined;
                if (value?.kind === "ok" && value.draft?.proposed) {
                  pendingDrafts.push(value.draft.proposed);
                }
              } else if (toolName === "note.show") {
                const value = event.result.value as
                  | { kind: "ok"; note: Note }
                  | { kind: "not_found" }
                  | undefined;
                if (value?.kind === "ok" && value.note) {
                  pendingNotes.push(value.note);
                }
              } else if (toolName === "flashcard.review_next") {
                const value = event.result.value as
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
                  pendingDueCards.push(...value.cards);
                }
              }
            }
          }
        } else if (event.type === "system_note") {
          // system_note acts as a bubble boundary; it is not rendered as an item.
          closeAssistantBubble();
        } else if (event.type === "interrupted") {
          // Turn was cancelled — close the open bubble, close reasoning block,
          // drain pending settle timers, and append a cancel marker.
          closeAssistantBubble();
          closeReasoningBlock();
          for (const { timer } of pendingSettleTimers.values()) clearTimeout(timer);
          pendingSettleTimers.clear();
          setThinking(false);
          setItems((prev) => [...prev, { kind: "cancel-marker", id: nextId() }]);
          break;
        } else if (event.type === "error") {
          closeAssistantBubble();
          setThinking(false);
          setLastError(event.error.message);
          break;
        }
      }
    } catch (err) {
      setThinking(false);
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      iteratorRef.current = null;
      // Ensure any open bubble and reasoning block are closed (marks streaming: false).
      closeAssistantBubble();
      closeReasoningBlock();
      // Drain any remaining pending settle timers by firing them immediately.
      // (The interrupted branch clears them on cancel; any remaining here are
      // from normal completion where tool_result arrived but the pacing timer
      // hasn't fired yet — settle them now so no dangling in_flight items remain.)
      for (const { timer, settleNow } of pendingSettleTimers.values()) {
        clearTimeout(timer);
        settleNow();
      }
      pendingSettleTimers.clear();

      // Drain any remaining pending renderables into the most-recent assistant
      // bubble (fallback for the case where tool was the last thing in the stream).
      if (
        lastAssistantId !== null &&
        (pendingCitations.length > 0 ||
          pendingDrafts.length > 0 ||
          pendingNotes.length > 0 ||
          pendingDueCards.length > 0)
      ) {
        const targetId = lastAssistantId;
        const citations = pendingCitations.length > 0 ? [...pendingCitations] : undefined;
        const drafts = pendingDrafts.length > 0 ? [...pendingDrafts] : undefined;
        const notes = pendingNotes.length > 0 ? [...pendingNotes] : undefined;
        const dueCards = pendingDueCards.length > 0 ? [...pendingDueCards] : undefined;
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
      }

      setIsStreaming(false);
      setThinking(false);

      // ── Auto-flush pending queue ──────────────────────────────────────────
      // If the user explicitly cancelled (Stop button), preserve the pending
      // queue — they signalled intent to stop this train of thought. If the
      // turn ended naturally (or after an error), dequeue the next message
      // and start a new turn via setTimeout(0) so React commits the just-
      // finished turn's items before we kick off the next send.
      if (!userCancelledRef.current) {
        const queue = pendingQueueRef.current;
        if (queue.length > 0) {
          const [next, ...rest] = queue;
          // Eagerly update both ref and state so cancelPending sees the new queue.
          pendingQueueRef.current = rest;
          setPendingQueue(rest);
          // Remove the pending bubble for this message (it will become a real
          // user bubble in the recursive send call).
          setItems((prev) =>
            prev.filter((it) => !(it.kind === "pending-message" && it.id === next?.id)),
          );
          // Fire-and-forget via macrotask so React has time to commit.
          // Each queued message becomes a fully independent turn. If the user
          // submits again during this new turn, the queue grows again.
          if (next !== undefined) {
            setTimeout(() => {
              void send(sessionId, next.content, next.sketchId);
            }, 0);
          }
        }
      }
      // Always reset the cancelled flag — the next send() clears it anyway,
      // but clearing here too keeps the invariant tight.
      userCancelledRef.current = false;
    }
  };

  const clearMessages = () => {
    setItems([]);
    setLastError(null);
  };

  const loadHistory = async (sessionId: SessionId): Promise<void> => {
    if (isStreaming) return;
    try {
      const collected: EpisodicEvent[] = [];
      for await (const ev of client.memory.episodic({ sessionId })) {
        collected.push(ev);
      }
      setItems(episodicToItems(collected));
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    }
  };

  return {
    items,
    isStreaming,
    thinking,
    lastError,
    send,
    cancel,
    cancelPending,
    pendingCount: pendingQueue.length,
    clearMessages,
    loadHistory,
  };
}
