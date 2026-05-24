import type {
  EpisodicEvent,
  Note,
  PraxisClient,
  ProposedCourse,
  RetrievalCitation,
  SessionId,
  SystemNoteOrigin,
} from "@praxis/core/types";
import { useState } from "react";
import type { ReviewCard } from "../components/flashcard-review.js";
import { episodicToItems } from "./episodic-to-messages.js";
import { useInterstitialLifecycle } from "./use-interstitial-lifecycle.js";
import type { PendingMessage } from "./use-pending-queue.js";
import { usePendingQueue } from "./use-pending-queue.js";
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

  const queue = usePendingQueue();
  const bubbles = useStreamedBubbles(setItems, setThinking);
  const interstitial = useInterstitialLifecycle();
  const reasoning = useReasoningBlocks();

  const send = async (sessionId: SessionId, message: string, sketchId?: string): Promise<void> => {
    if (isStreaming) {
      const pendingId = nextId();
      const entry: PendingMessage = { id: pendingId, content: message };
      if (sketchId !== undefined) entry.sketchId = sketchId;
      queue.enqueue(entry, setItems);
      return;
    }

    queue.userCancelledRef.current = false;
    setLastError(null);

    const userMsgId = nextId();
    setItems((prev) => [
      ...prev,
      { kind: "message", id: userMsgId, role: "user", content: message, rawContent: message },
    ]);

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

        if (event.type === "user_message") continue;

        if (event.type === "thinking") {
          reasoning.onThinking(event.content, setItems);
        } else if (event.type === "model_message") {
          reasoning.closeReasoningBlock(setItems);

          if (bubbles.currentAssistantId === null) {
            bubbles.openAssistantBubble(interstitial.drainRenderables());
          }
          if (event.partial === true) {
            bubbles.appendContent(event.content, setItems);
          } else {
            bubbles.setContent(event.content, setItems);
            bubbles.closeAssistantBubble();
          }
        } else if (event.type === "tool_call") {
          bubbles.closeAssistantBubble();
          reasoning.closeReasoningBlock(setItems);
          interstitial.onToolCall(event, setItems);
        } else if (event.type === "tool_result") {
          setThinking(true);
          interstitial.onToolResult(event, setItems);
        } else if (event.type === "system_note") {
          bubbles.closeAssistantBubble();
          setItems((prev) => [
            ...prev,
            { kind: "system-note", id: nextId(), content: event.content, origin: event.origin },
          ]);
          opts?.onSystemNote?.(sessionId);
        } else if (event.type === "interrupted") {
          bubbles.closeAssistantBubble();
          reasoning.closeReasoningBlock(setItems);
          interstitial.onInterrupted();
          setThinking(false);
          setItems((prev) => [...prev, { kind: "cancel-marker", id: nextId() }]);
          break;
        } else if (event.type === "error") {
          bubbles.closeAssistantBubble();
          setThinking(false);
          setLastError(event.error.message);
          break;
        }
      }
    } catch (err) {
      setThinking(false);
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      queue.iteratorRef.current = null;
      bubbles.closeAssistantBubble();
      reasoning.closeReasoningBlock(setItems);
      interstitial.drainOnFinally(bubbles.lastAssistantId, setItems);
      setIsStreaming(false);
      setThinking(false);
      const next = queue.dequeueNext(setItems);
      if (next !== null) {
        setTimeout(() => {
          void send(sessionId, next.content, next.sketchId);
        }, 0);
      }
      queue.userCancelledRef.current = false;
    }
  };

  const cancelPending = (pendingId: string): void => {
    queue.cancelPending(pendingId, setItems);
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
    pendingCount: queue.pendingCount,
    clearMessages,
    loadHistory,
  };
}
