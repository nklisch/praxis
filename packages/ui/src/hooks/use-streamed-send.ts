import type {
  EpisodicEvent,
  Note,
  PraxisClient,
  ProposedCourse,
  RetrievalCitation,
  SessionId,
  Timestamp,
} from "@praxis/core/types";
import { getToolLabel } from "@praxis/tools/labels";
import { useState } from "react";
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
}

export type ChatStreamItem =
  | ({ kind: "message" } & ChatMessage)
  | ({ kind: "interstitial" } & ToolInterstitial);

export interface UseStreamedSendResult {
  items: ChatStreamItem[];
  isStreaming: boolean;
  lastError: string | null;
  send: (sessionId: SessionId, message: string) => Promise<void>;
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
  const [lastError, setLastError] = useState<string | null>(null);

  const send = async (sessionId: SessionId, message: string): Promise<void> => {
    if (isStreaming) return;
    setLastError(null);

    // Immediately add user bubble to local state.
    const userMsgId = nextId();
    setItems((prev) => [
      ...prev,
      { kind: "message", id: userMsgId, role: "user", content: message, rawContent: message },
    ]);

    // Add a placeholder assistant bubble for streaming.
    const assistantMsgId = nextId();
    setItems((prev) => [
      ...prev,
      {
        kind: "message",
        id: assistantMsgId,
        role: "assistant",
        content: "",
        rawContent: "",
        streaming: true,
      },
    ]);

    setIsStreaming(true);
    let finalContent = "";
    // Track pending tool calls by callId → toolName (supports concurrent fan-out).
    const pendingByCallId = new Map<string, string>();
    const accumulatedCitations: RetrievalCitation[] = [];
    const accumulatedDrafts: ProposedCourse[] = [];
    const accumulatedNotes: Note[] = [];
    const accumulatedDueCards: ReviewCard[] = [];

    try {
      for await (const event of client.session.send(sessionId, message)) {
        // Ignore user_message events — user bubble already in local state.
        if (event.type === "user_message") continue;

        if (event.type === "model_message") {
          if (event.partial === true) {
            // Streaming delta — append to running content.
            finalContent += event.content;
          } else {
            // Final non-partial — this is the assembled content for the turn.
            finalContent = event.content;
          }
          setItems((prev) =>
            prev.map((item) =>
              item.kind === "message" && item.id === assistantMsgId
                ? { ...item, content: finalContent, rawContent: finalContent, streaming: true }
                : item,
            ),
          );
        } else if (event.type === "tool_call") {
          const { toolName, callId } = event;
          // Always track in pendingByCallId for result harvesting (even hidden tools).
          pendingByCallId.set(callId, toolName);

          const label = getToolLabel(toolName);
          if (!label.hidden) {
            // Push a visible interstitial item for this tool call.
            setItems((prev) => [
              ...prev,
              { kind: "interstitial", callId, toolName, status: "in_flight" },
            ]);
          }
        } else if (event.type === "tool_result") {
          const { callId } = event;
          const toolName = pendingByCallId.get(callId);
          if (toolName === undefined) {
            console.warn(`[useStreamedSend] Unmatched tool_result for callId=${callId}`);
          } else {
            pendingByCallId.delete(callId);

            // Settle any visible interstitial with this callId.
            setItems((prev) =>
              prev.map((item) => {
                if (item.kind === "interstitial" && item.callId === callId) {
                  return {
                    ...item,
                    status: "settled",
                    ...(event.result.ok === false && { errored: true }),
                  };
                }
                return item;
              }),
            );

            // Dispatch on tool name for renderable result harvesting.
            if (event.result.ok) {
              if (toolName === "retrieve_from_textbook") {
                const value = event.result.value as { citations?: RetrievalCitation[] } | undefined;
                if (value?.citations && Array.isArray(value.citations)) {
                  accumulatedCitations.push(...(value.citations as RetrievalCitation[]));
                }
              } else if (toolName === "course.show_draft") {
                const value = event.result.value as
                  | { kind: "ok"; draft: { proposed: ProposedCourse } }
                  | { kind: "not_found" }
                  | undefined;
                if (value?.kind === "ok" && value.draft?.proposed) {
                  accumulatedDrafts.push(value.draft.proposed);
                }
              } else if (toolName === "note.show") {
                const value = event.result.value as
                  | { kind: "ok"; note: Note }
                  | { kind: "not_found" }
                  | undefined;
                if (value?.kind === "ok" && value.note) {
                  accumulatedNotes.push(value.note);
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
                  accumulatedDueCards.push(...value.cards);
                }
              }
            }

            // Update the assistant message with accumulated tool-result data.
            if (
              accumulatedCitations.length > 0 ||
              accumulatedDrafts.length > 0 ||
              accumulatedNotes.length > 0 ||
              accumulatedDueCards.length > 0
            ) {
              setItems((prev) =>
                prev.map((item) => {
                  if (item.kind === "message" && item.id === assistantMsgId) {
                    return {
                      ...item,
                      ...(accumulatedCitations.length > 0 && {
                        citations: [...accumulatedCitations],
                      }),
                      ...(accumulatedDrafts.length > 0 && { drafts: [...accumulatedDrafts] }),
                      ...(accumulatedNotes.length > 0 && { notes: [...accumulatedNotes] }),
                      ...(accumulatedDueCards.length > 0 && { dueCards: [...accumulatedDueCards] }),
                    };
                  }
                  return item;
                }),
              );
            }
          }
        } else if (event.type === "error") {
          setLastError(event.error.message);
          break;
        }
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      // Mark assistant message as done (no longer streaming).
      setItems((prev) =>
        prev.map((item) => {
          if (item.kind === "message" && item.id === assistantMsgId) {
            return {
              ...item,
              streaming: false,
              ...(accumulatedCitations.length > 0 && { citations: [...accumulatedCitations] }),
              ...(accumulatedDrafts.length > 0 && { drafts: [...accumulatedDrafts] }),
              ...(accumulatedNotes.length > 0 && { notes: [...accumulatedNotes] }),
              ...(accumulatedDueCards.length > 0 && { dueCards: [...accumulatedDueCards] }),
            };
          }
          return item;
        }),
      );
      setIsStreaming(false);
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

  return { items, isStreaming, lastError, send, clearMessages, loadHistory };
}
