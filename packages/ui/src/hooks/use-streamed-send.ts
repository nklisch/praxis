import type {
  EngineEvent,
  EpisodicEvent,
  LogRecord,
  Note,
  PraxisClient,
  ProposedCourse,
  RetrievalCitation,
  SessionId,
  SystemNoteOrigin,
} from "@praxis/core/types";
import { getToolLabel } from "@praxis/tools/labels";
import { useRef, useState } from "react";
import type { ReviewCard } from "../components/flashcard-review.js";
import { episodicToItems } from "./episodic-to-messages.js";
import { useInterstitialLifecycle } from "./use-interstitial-lifecycle.js";
import type { PendingMessage } from "./use-pending-queue.js";
import { derivePendingCounts, usePendingQueue } from "./use-pending-queue.js";
import { useReasoningBlocks } from "./use-reasoning-blocks.js";
import { useStreamedBubbles } from "./use-streamed-bubbles.js";

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

/** Lifecycle status of a queued message. */
export type PendingMessageStatus = "queued" | "dispatching" | "failed";

/**
 * A message that has been submitted while the engine is streaming and is
 * waiting in the queue. Renders inline as a faded "pending" bubble. Never
 * persisted to episodic — pure UI state, dropped on app restart.
 */
export interface PendingMessageItem {
  kind: "pending-message";
  id: string;
  /** Message body — renamed from `content` for clarity in the queue lifecycle. */
  text: string;
  sketchId?: string;
  /** Lifecycle status. Default is `"queued"` on enqueue. */
  status: PendingMessageStatus;
  /** Error message set when `status === "failed"`. */
  errorReason?: string;
  /** `Date.now()` at the moment the item transitioned to `"failed"`. */
  failedAt?: number;
}

/**
 * A `system_note` event rendered inline as a `<SystemNoteCard>`.
 * Phase 16: emitted when a child assignment session submits; delivered to
 * the parent (teach-mode) session's stream. Only `assignment_submission`
 * origins produce a visible card; other origins fall through silently.
 */
export interface SystemNoteItem {
  kind: "system-note";
  id: string;
  content: string;
  origin: SystemNoteOrigin;
}

export type ChatStreamItem =
  | ({ kind: "message" } & ChatMessage)
  | ({ kind: "tool-entry" } & ToolEntryItem)
  | ({ kind: "sub-agent" } & SubAgentSpawn)
  | ({ kind: "thinking" } & ReasoningItem)
  | ({ kind: "cancel-marker" } & CancelMarker)
  | PendingMessageItem
  | SystemNoteItem;

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
  /**
   * Number of pending messages with status `queued` or `dispatching` (excludes failed).
   * Derived from the items array on every render.
   */
  pendingCount: number;
  /**
   * Number of pending messages with status `failed`.
   * Derived from the items array on every render.
   */
  failedCount: number;
  clearMessages: () => void;
  /**
   * Commit an inline text edit to a `queued` pending item.
   * No-op + warn log if the item is `dispatching` or `failed`.
   */
  editPending: (id: string, newText: string) => void;
  /**
   * Transition a `failed` item back to `queued` and return its params for
   * re-dispatch, or `null` if the item isn't currently `failed`.
   */
  retryFailed: (id: string) => { text: string; sketchId?: string } | null;
  /**
   * Remove a `failed` item from the item list entirely.
   * No-op + warn log if the item is not `failed`.
   */
  removeFailed: (id: string) => void;
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

let rendererEventCounter = 0;
function nextRendererEventId(): string {
  return `renderer-event-${++rendererEventCounter}`;
}

interface NormalizedStreamText {
  text: string;
  normalized: boolean;
  contentType: string;
}

function normalizeStreamText(content: unknown): NormalizedStreamText {
  if (typeof content === "string") {
    return { text: content, normalized: false, contentType: "string" };
  }

  const contentType = Array.isArray(content) ? "array" : content === null ? "null" : typeof content;
  if (content === undefined || content === null) {
    return { text: "", normalized: true, contentType };
  }

  try {
    const json = JSON.stringify(content);
    return { text: json ?? String(content), normalized: true, contentType };
  } catch {
    return { text: String(content), normalized: true, contentType };
  }
}

function callIdForEvent(event: EngineEvent): string | undefined {
  if (event.type === "tool_call" || event.type === "tool_result") {
    return event.callId;
  }
  return undefined;
}

interface RendererOutcomeInput {
  sessionId: SessionId;
  eventType: string;
  outcome: string;
  callId?: string;
  streamId?: string;
  errorSummary?: string;
  details?: Record<string, unknown>;
}

export function useStreamedSend(
  client: PraxisClient,
  opts?: {
    /**
     * Called when a `system_note` event arrives in the stream for `sessionId`.
     * Used by `TeachChatTabBody` to trigger the pulse animation on the parent
     * tab in the tab strip.
     */
    onSystemNote?: (sessionId: SessionId) => void;
  },
): UseStreamedSendResult {
  const [items, setItems] = useState<ChatStreamItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const streamingLockRef = useRef(false);

  const queue = usePendingQueue();
  const bubbles = useStreamedBubbles(setItems, setThinking);
  const interstitial = useInterstitialLifecycle();
  const reasoning = useReasoningBlocks();

  /**
   * Extract a user-readable error message from an unknown thrown value.
   * Keeps the direct-send and markFailed paths consistent.
   */
  const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

  const emitRendererOutcome = (input: RendererOutcomeInput): string => {
    const rendererEventId = nextRendererEventId();
    const fields: Record<string, unknown> = {
      rendererEventId,
      sessionId: input.sessionId,
      eventType: input.eventType,
      outcome: input.outcome,
      ...(input.callId !== undefined && { callId: input.callId }),
      ...(input.streamId !== undefined && { streamId: input.streamId }),
      ...(input.errorSummary !== undefined && { errorSummary: input.errorSummary }),
      ...(input.details ?? {}),
    };
    const record: LogRecord = {
      level: "debug",
      time: Date.now(),
      message: "renderer.trace.outcome",
      bindings: { component: "renderer-trace", surface: "chat" },
      fields,
    };

    try {
      client.log.record(record);
    } catch (err) {
      console.warn("[praxis] renderer outcome logging failed", err);
    }

    return rendererEventId;
  };

  /**
   * Core send dispatcher. Called both for:
   *   - Direct user sends (pendingId = null, surface errors via lastError)
   *   - Queue-dequeued sends (pendingId = string, surface errors via markFailed)
   *
   * `pendingId` is NOT part of the public API — callers use `send()` below.
   *
   * Note on the pending-bubble lifecycle for queue-dispatched sends:
   *   `dequeueNext` (called from the previous turn's `finally`) removes the pending
   *   bubble from items before `sendInternal` runs. So `markDispatching` cannot be
   *   called here (the item is already gone). Instead, on failure we re-inject the
   *   bubble as a `"failed"` item so the user can retry or discard it.
   */
  const sendInternal = async (
    sessionId: SessionId,
    message: string,
    sketchId: string | undefined,
    pendingId: string | null,
  ): Promise<void> => {
    streamingLockRef.current = true;
    queue.userCancelledRef.current = false;
    setLastError(null);

    const userMsgId = nextId();
    setItems((prev) => [
      ...prev,
      { kind: "message", id: userMsgId, role: "user", content: message, rawContent: message },
    ]);
    emitRendererOutcome({
      sessionId,
      eventType: "user_message",
      outcome: "user_message_rendered",
      details: { itemId: userMsgId },
    });

    setIsStreaming(true);
    setThinking(true);
    bubbles.reset();
    interstitial.reset();
    reasoning.reset();

    try {
      const stream = client.session.send(sessionId, message);
      const iter = stream[Symbol.asyncIterator]();
      queue.iteratorRef.current = iter;

      while (true) {
        const r = await iter.next();
        if (r.done) break;
        const event = r.value;
        const callId = callIdForEvent(event);
        emitRendererOutcome({
          sessionId,
          eventType: event.type,
          outcome: "event_accepted",
          ...(callId !== undefined && { callId }),
        });

        if (event.type === "user_message") continue;

        if (event.type === "thinking") {
          const content = normalizeStreamText(event.content);
          if (content.normalized) {
            emitRendererOutcome({
              sessionId,
              eventType: event.type,
              outcome: "content_normalized",
              details: { contentType: content.contentType },
            });
          }
          reasoning.onThinking(content.text, setItems);
        } else if (event.type === "model_message") {
          reasoning.closeReasoningBlock(setItems);

          if (bubbles.currentAssistantId === null) {
            bubbles.openAssistantBubble(interstitial.drainRenderables());
          }
          const content = normalizeStreamText(event.content);
          if (content.normalized) {
            emitRendererOutcome({
              sessionId,
              eventType: event.type,
              outcome: "content_normalized",
              details: { contentType: content.contentType },
            });
          }
          if (event.partial === true) {
            bubbles.appendContent(content.text, setItems);
          } else {
            bubbles.setContent(content.text, setItems);
            bubbles.closeAssistantBubble();
          }
          emitRendererOutcome({
            sessionId,
            eventType: event.type,
            outcome: "model_message_rendered",
            details: { partial: event.partial === true },
          });
        } else if (event.type === "tool_call") {
          bubbles.closeAssistantBubble();
          reasoning.closeReasoningBlock(setItems);
          interstitial.onToolCall(event, setItems);
          const toolLabel = getToolLabel(event.toolName);
          emitRendererOutcome({
            sessionId,
            eventType: event.type,
            outcome:
              toolLabel.spawnsSubAgent === true ? "sub_agent_rendered" : "tool_call_rendered",
            callId: event.callId,
            details: { toolName: event.toolName },
          });
        } else if (event.type === "tool_result") {
          setThinking(true);
          const matched = interstitial.isToolResultExpected(event.callId);
          interstitial.onToolResult(event, setItems);
          emitRendererOutcome({
            sessionId,
            eventType: event.type,
            outcome: matched ? "tool_result_rendered" : "tool_result_unmatched",
            callId: event.callId,
            ...(!matched && { errorSummary: "tool_result had no matching tool_call in renderer" }),
          });
        } else if (event.type === "system_note") {
          bubbles.closeAssistantBubble();
          const content = normalizeStreamText(event.content);
          if (content.normalized) {
            emitRendererOutcome({
              sessionId,
              eventType: event.type,
              outcome: "content_normalized",
              details: { contentType: content.contentType },
            });
          }
          const itemId = nextId();
          setItems((prev) => [
            ...prev,
            { kind: "system-note", id: itemId, content: content.text, origin: event.origin },
          ]);
          emitRendererOutcome({
            sessionId,
            eventType: event.type,
            outcome: "system_note_rendered",
            details: { itemId, originKind: event.origin.kind },
          });
          opts?.onSystemNote?.(sessionId);
        } else if (event.type === "interrupted") {
          bubbles.closeAssistantBubble();
          reasoning.closeReasoningBlock(setItems);
          interstitial.onInterrupted();
          setThinking(false);
          const itemId = nextId();
          setItems((prev) => [...prev, { kind: "cancel-marker", id: itemId }]);
          emitRendererOutcome({
            sessionId,
            eventType: event.type,
            outcome: "cancel_marker_rendered",
            errorSummary: event.reason,
            details: { itemId },
          });
          break;
        } else if (event.type === "error") {
          bubbles.closeAssistantBubble();
          setThinking(false);
          setLastError(event.error.message);
          emitRendererOutcome({
            sessionId,
            eventType: event.type,
            outcome: "stream_error",
            errorSummary: event.error.message,
            details: { code: event.error.code, recoverable: event.error.recoverable },
          });
          break;
        } else if (event.type === "final") {
          emitRendererOutcome({
            sessionId,
            eventType: event.type,
            outcome: "final_completed",
            ...(event.errorMessage !== undefined && { errorSummary: event.errorMessage }),
            details: { finalReason: event.finalReason ?? "success" },
          });
        }
      }
    } catch (err) {
      setThinking(false);
      const summary = errorMessage(err);
      if (queue.userCancelledRef.current) {
        // User-initiated cancel via Stop button — do NOT mark failed.
        // The queue is preserved; the user can retry manually.
        emitRendererOutcome({
          sessionId,
          eventType: "stream",
          outcome: "stream_cancelled",
          errorSummary: summary,
        });
        return;
      }
      emitRendererOutcome({
        sessionId,
        eventType: "stream",
        outcome: "stream_exception",
        errorSummary: summary,
      });
      if (pendingId !== null) {
        // Queue-dispatched send failed. The pending bubble was already removed
        // from items by `dequeueNext`, so we re-inject it as a "failed" item
        // so the user can retry or discard inline.
        setItems((prev) => [
          ...prev,
          {
            kind: "pending-message",
            id: pendingId,
            text: message,
            status: "failed",
            errorReason: summary,
            failedAt: Date.now(),
            ...(sketchId !== undefined && { sketchId }),
          } satisfies PendingMessageItem,
        ]);
        return;
      }
      // Direct (non-queued) send error — fall back to the orchestrator-level banner.
      setLastError(summary);
    } finally {
      queue.iteratorRef.current = null;
      bubbles.closeAssistantBubble();
      reasoning.closeReasoningBlock(setItems);
      interstitial.drainOnFinally(bubbles.lastAssistantId, setItems);
      emitRendererOutcome({
        sessionId,
        eventType: "stream",
        outcome: "stream_finalized",
      });
      const next = queue.dequeueNext(setItems);
      if (next !== null) {
        setIsStreaming(false);
        setThinking(false);
        setTimeout(() => {
          void sendInternal(sessionId, next.text, next.sketchId, next.id);
        }, 0);
      } else {
        streamingLockRef.current = false;
        setIsStreaming(false);
        setThinking(false);
      }
      queue.userCancelledRef.current = false;
    }
  };

  const send = async (sessionId: SessionId, message: string, sketchId?: string): Promise<void> => {
    if (streamingLockRef.current) {
      const pendingId = nextId();
      const entry: PendingMessage = { id: pendingId, text: message };
      if (sketchId !== undefined) entry.sketchId = sketchId;
      queue.enqueue(entry, setItems);
      return;
    }

    await sendInternal(sessionId, message, sketchId, null);
  };

  const cancelPending = (pendingId: string): void => {
    queue.cancelPending(pendingId, setItems);
  };

  const editPending = (id: string, newText: string): void => {
    queue.editPending(id, newText, setItems);
  };

  const retryFailed = (id: string): { text: string; sketchId?: string } | null => {
    return queue.retryFailed(id, setItems);
  };

  const removeFailed = (id: string): void => {
    queue.removeFailed(id, setItems);
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
    cancel: queue.cancel,
    cancelPending,
    ...derivePendingCounts(items),
    clearMessages,
    editPending,
    retryFailed,
    removeFailed,
    loadHistory,
  };
}
