import type {
  EpisodicEvent,
  Flashcard,
  Note,
  PraxisClient,
  ProposedCourse,
  RetrievalCitation,
  SessionId,
  Timestamp,
} from "@praxis/core/types";
import { useState } from "react";
import type { ReviewCard } from "../components/flashcard-review.js";
import { episodicToMessages } from "./episodic-to-messages.js";

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

export interface UseStreamedSendResult {
  messages: ChatMessage[];
  isStreaming: boolean;
  lastError: string | null;
  send: (sessionId: SessionId, message: string) => Promise<void>;
  clearMessages: () => void;
  /**
   * Load the persisted transcript for an existing session and replace the
   * local message log with it. Call once per session-id on mount so the user
   * sees their prior conversation when re-opening a tab or relaunching the
   * app. No-op while a turn is mid-stream — replacing messages then would
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const send = async (sessionId: SessionId, message: string): Promise<void> => {
    if (isStreaming) return;
    setLastError(null);

    // Immediately add user bubble to local state.
    const userMsgId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: message, rawContent: message },
    ]);

    // Add a placeholder assistant bubble for streaming.
    const assistantMsgId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", rawContent: "", streaming: true },
    ]);

    setIsStreaming(true);
    let finalContent = "";
    // Track the most recent tool_call name so we know which tool_result to harvest
    let lastToolCallName: string | null = null;
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
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: finalContent, rawContent: finalContent, streaming: true }
                : m,
            ),
          );
        } else if (event.type === "tool_call") {
          // Track the tool name so we know what to expect in tool_result
          lastToolCallName = event.toolName;
        } else if (event.type === "tool_result") {
          // Dispatch on tool name — extensible: add new renderable tools here.
          if (lastToolCallName === "retrieve_from_textbook" && event.result.ok) {
            const value = event.result.value as { citations?: RetrievalCitation[] } | undefined;
            if (value?.citations && Array.isArray(value.citations)) {
              accumulatedCitations.push(...(value.citations as RetrievalCitation[]));
            }
          } else if (lastToolCallName === "course.show_draft" && event.result.ok) {
            // show_draft returns { kind: "ok", draft: DraftCourseState } or { kind: "not_found" }
            const value = event.result.value as
              | { kind: "ok"; draft: { proposed: ProposedCourse } }
              | { kind: "not_found" }
              | undefined;
            if (value?.kind === "ok" && value.draft?.proposed) {
              accumulatedDrafts.push(value.draft.proposed);
            }
          } else if (lastToolCallName === "note.show" && event.result.ok) {
            // note.show returns { kind: "ok", note: Note } or { kind: "not_found" }
            const value = event.result.value as
              | { kind: "ok"; note: Note }
              | { kind: "not_found" }
              | undefined;
            if (value?.kind === "ok" && value.note) {
              accumulatedNotes.push(value.note);
            }
          } else if (lastToolCallName === "flashcard.review_next" && event.result.ok) {
            // review_next returns { ok: true, cards: Array<{flashcardId, front, conceptId?, preview}> }
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
          lastToolCallName = null;
          // Update message with accumulated tool-result data
          if (
            accumulatedCitations.length > 0 ||
            accumulatedDrafts.length > 0 ||
            accumulatedNotes.length > 0 ||
            accumulatedDueCards.length > 0
          ) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      ...(accumulatedCitations.length > 0 && {
                        citations: [...accumulatedCitations],
                      }),
                      ...(accumulatedDrafts.length > 0 && { drafts: [...accumulatedDrafts] }),
                      ...(accumulatedNotes.length > 0 && { notes: [...accumulatedNotes] }),
                      ...(accumulatedDueCards.length > 0 && { dueCards: [...accumulatedDueCards] }),
                    }
                  : m,
              ),
            );
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                streaming: false,
                ...(accumulatedCitations.length > 0 && { citations: [...accumulatedCitations] }),
                ...(accumulatedDrafts.length > 0 && { drafts: [...accumulatedDrafts] }),
                ...(accumulatedNotes.length > 0 && { notes: [...accumulatedNotes] }),
                ...(accumulatedDueCards.length > 0 && { dueCards: [...accumulatedDueCards] }),
              }
            : m,
        ),
      );
      setIsStreaming(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
    setLastError(null);
  };

  const loadHistory = async (sessionId: SessionId): Promise<void> => {
    if (isStreaming) return;
    try {
      const collected: EpisodicEvent[] = [];
      for await (const ev of client.memory.episodic({ sessionId })) {
        collected.push(ev);
      }
      setMessages(episodicToMessages(collected));
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    }
  };

  return { messages, isStreaming, lastError, send, clearMessages, loadHistory };
}
