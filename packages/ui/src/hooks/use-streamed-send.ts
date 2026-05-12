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
import { useCallback, useRef, useState } from "react";
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
  /** Citations from retrieve_from_textbook tool calls in this message. */
  citations?: RetrievalCitation[];
  /** Draft courses from course.show_draft tool calls in this message. */
  drafts?: ProposedCourse[];
  /** Notes from note.show tool calls in this message. */
  notes?: Note[];
  /** Due cards from flashcard.review_next tool calls in this message. */
  dueCards?: ReviewCard[];
}

export interface ToolInterstitial {
  /** EngineEvent.callId — pairs tool_call with tool_result. */
  callId: string;
  toolName: string;
  /** "in_flight" while awaiting tool_result; "settled" once the result lands. */
  status: "in_flight" | "settled";
  /** True when the matched tool_result.ok === false. */
  errored?: boolean;
  /** Wall-clock timestamp when this interstitial first appeared. Used to enforce MIN_INTERSTITIAL_VISIBLE_MS. */
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

export type ChatStreamItem =
  | ({ kind: "message" } & ChatMessage)
  | ({ kind: "interstitial" } & ToolInterstitial)
  | ({ kind: "thinking" } & ReasoningItem)
  | ({ kind: "cancel-marker" } & CancelMarker);

export interface UseStreamedSendResult {
  items: ChatStreamItem[];
  isStreaming: boolean;
  /** True when the engine is working but has not yet emitted assistant text in the current segment. */
  thinking: boolean;
  lastError: string | null;
  send: (sessionId: SessionId, message: string) => Promise<void>;
  /**
   * Cancel the in-flight turn. No-op if not currently streaming.
   * Triggers iterator.return() which fires the praxis.session.send.cancel IPC channel.
   */
  cancel: () => void;
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

export function useStreamedSend(client: PraxisClient): UseStreamedSendResult {
  const [items, setItems] = useState<ChatStreamItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Ref to the active iterator so cancel() can call .return() from outside the send closure.
  const iteratorRef = useRef<AsyncIterator<EngineEvent> | null>(null);

  const cancel = useCallback((): void => {
    iteratorRef.current?.return?.();
  }, []);

  const send = async (sessionId: SessionId, message: string): Promise<void> => {
    if (isStreaming) return;
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
    const pendingSettleTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; settleNow: () => void }>();

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
        prev.map((it) => (it.kind === "thinking" && it.id === id ? { ...it, streaming: false } : it)),
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
          if (!label.hidden) {
            // Push a visible interstitial item for this tool call.
            const firstSeenAt = Date.now();
            interstitialFirstSeenAt.set(callId, firstSeenAt);
            setItems((prev) => [
              ...prev,
              { kind: "interstitial", callId, toolName, status: "in_flight", firstSeenAt },
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

            // Settle any visible interstitial with this callId, pacing to MIN_INTERSTITIAL_VISIBLE_MS.
            const seenAt = interstitialFirstSeenAt.get(callId);

            const errored = event.result.ok === false;
            const settleNow = (): void => {
              setItems((prev) =>
                prev.map((it) => {
                  if (it.kind === "interstitial" && it.callId === callId) {
                    return {
                      ...it,
                      status: "settled" as const,
                      ...(errored && { errored: true }),
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
              if (toolName === "retrieve_from_textbook") {
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

  return { items, isStreaming, thinking, lastError, send, cancel, clearMessages, loadHistory };
}
