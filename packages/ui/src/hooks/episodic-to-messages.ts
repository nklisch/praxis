import type {
  EpisodicEvent,
  Note,
  ProposedCourse,
  RetrievalCitation,
  Timestamp,
} from "@praxis/core/types";
import { getToolLabel } from "@praxis/tools/labels";
import type { ReviewCard } from "../components/flashcard-review.js";
import type { ChatMessage, ChatStreamItem, ToolInterstitial } from "./use-streamed-send.js";

/** Subset of the streamed `tool_result.value` shapes we render today. Mirrors `useStreamedSend`. */
type ToolResultValue =
  | { citations?: RetrievalCitation[] }
  | { kind: "ok"; draft: { proposed: ProposedCourse } }
  | { kind: "ok"; note: Note }
  | { kind: "not_found" }
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

interface AssistantAcc {
  /** Final assembled assistant text for the turn. */
  content: string;
  /** callId → toolName for in-flight tool calls awaiting their tool_result. */
  pendingByCallId: Map<string, string>;
  citations: RetrievalCitation[];
  drafts: ProposedCourse[];
  notes: Note[];
  dueCards: ReviewCard[];
}

function emptyAssistantAcc(): AssistantAcc {
  return {
    content: "",
    pendingByCallId: new Map(),
    citations: [],
    drafts: [],
    notes: [],
    dueCards: [],
  };
}

/**
 * Reconstruct the rendered chat item log from a session's episodic events.
 *
 * The episodic stream is ordered by `(turnIndex asc, ts asc)` (see
 * `MemoryService.episodic`), so we can walk it once. Per turn:
 * - `user_message` → emit a user `ChatMessage`.
 * - `model_message` → assemble into the turn's single assistant message.
 *   Partial deltas append; a non-partial final replaces. This mirrors the
 *   live-stream logic in `useStreamedSend.send`.
 * - `tool_call` → push an interstitial item (if not hidden), track in
 *   pendingByCallId so the matching tool_result knows the tool name.
 * - `tool_result` → settle the matching interstitial; harvest citations /
 *   drafts / notes / due-cards onto the current assistant message.
 * - `final` / `error` → flush any pending assistant message and move on.
 *
 * History errors are intentionally not rendered as banners — the user has
 * already moved past them, and surfacing every old failure on reload would be
 * noise. The live `lastError` channel handles errors from the active turn.
 */
export function episodicToItems(events: readonly EpisodicEvent[]): ChatStreamItem[] {
  const items: ChatStreamItem[] = [];
  let currentTurn: number | null = null;
  let assistant: AssistantAcc | null = null;
  let counter = 0;
  const id = (kind: "user" | "asst") => `hist-${kind}-${++counter}`;

  /** Push the current assistant accumulator (if any) onto items and reset. */
  const flushAssistant = () => {
    if (!assistant) return;
    // Only emit if the turn produced something visible — a model message,
    // a renderable tool result, or both. Empty assistant turns (pure tool
    // chatter that produced nothing renderable AND no visible interstitials)
    // are dropped to keep the restored log compact.
    const hasContent =
      assistant.content.length > 0 ||
      assistant.citations.length > 0 ||
      assistant.drafts.length > 0 ||
      assistant.notes.length > 0 ||
      assistant.dueCards.length > 0;
    if (hasContent) {
      const msg: ChatMessage = {
        id: id("asst"),
        role: "assistant",
        content: assistant.content,
        rawContent: assistant.content,
        streaming: false,
      };
      if (assistant.citations.length > 0) msg.citations = assistant.citations;
      if (assistant.drafts.length > 0) msg.drafts = assistant.drafts;
      if (assistant.notes.length > 0) msg.notes = assistant.notes;
      if (assistant.dueCards.length > 0) msg.dueCards = assistant.dueCards;
      items.push({ kind: "message", ...msg });
    }
    assistant = null;
  };

  for (const ep of events) {
    const turnIndex = ep.source.turnIndex;
    if (currentTurn !== null && turnIndex !== currentTurn) {
      // Turn boundary — finalize whatever the previous turn produced.
      flushAssistant();
    }
    currentTurn = turnIndex;
    const event = ep.event;

    switch (event.type) {
      case "user_message":
        // A user message starts a new turn; flush any prior assistant first
        // (defensive — a well-formed stream already had the turn-boundary flush).
        flushAssistant();
        items.push({
          kind: "message",
          id: id("user"),
          role: "user",
          content: event.content,
          rawContent: event.content,
        });
        assistant = emptyAssistantAcc();
        break;

      case "model_message": {
        if (!assistant) assistant = emptyAssistantAcc();
        if (event.partial === true) {
          assistant.content += event.content;
        } else {
          assistant.content = event.content;
        }
        break;
      }

      case "tool_call": {
        if (!assistant) assistant = emptyAssistantAcc();
        const { toolName, callId } = event;
        // Always track for result harvesting, even for hidden tools.
        assistant.pendingByCallId.set(callId, toolName);

        const label = getToolLabel(toolName);
        if (!label.hidden) {
          // Insert a settled interstitial — replay shows the finished state.
          // We'll update it to settled when we encounter the tool_result.
          // For now push as in_flight; the tool_result handler will settle it.
          const interstitial: ToolInterstitial = {
            callId,
            toolName,
            status: "in_flight",
          };
          items.push({ kind: "interstitial", ...interstitial });
        }
        break;
      }

      case "tool_result": {
        if (!assistant) {
          assistant = emptyAssistantAcc();
        }
        const { callId } = event;
        const toolName = assistant.pendingByCallId.get(callId);
        assistant.pendingByCallId.delete(callId);

        // Settle the matching interstitial in the items array (walk from end).
        for (let i = items.length - 1; i >= 0; i--) {
          const item = items[i];
          if (item?.kind === "interstitial" && item.callId === callId) {
            items[i] = {
              ...item,
              status: "settled",
              ...(event.result.ok === false && { errored: true }),
            };
            break;
          }
        }

        if (!event.result.ok) break;
        const value = event.result.value as ToolResultValue;
        if (toolName === "retrieve_from_textbook") {
          const v = value as { citations?: RetrievalCitation[] } | undefined;
          if (v?.citations && Array.isArray(v.citations)) {
            assistant.citations.push(...v.citations);
          }
        } else if (toolName === "course.show_draft") {
          const v = value as
            | { kind: "ok"; draft: { proposed: ProposedCourse } }
            | { kind: "not_found" }
            | undefined;
          if (v?.kind === "ok" && v.draft?.proposed) assistant.drafts.push(v.draft.proposed);
        } else if (toolName === "note.show") {
          const v = value as { kind: "ok"; note: Note } | { kind: "not_found" } | undefined;
          if (v?.kind === "ok" && v.note) assistant.notes.push(v.note);
        } else if (toolName === "flashcard.review_next") {
          const v = value as
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
          if (v?.ok && Array.isArray(v.cards)) assistant.dueCards.push(...v.cards);
        }
        break;
      }

      case "final":
      case "error":
        // Don't surface; the live error channel handles the active turn,
        // and `final` is a turn boundary (the next user_message will flush).
        break;
    }
  }

  // End-of-stream flush.
  flushAssistant();
  return items;
}

/**
 * @deprecated Use `episodicToItems` instead. Returns `ChatStreamItem[]` now.
 * This alias exists for the transition; it will be removed in a follow-up.
 */
export const episodicToMessages = episodicToItems;
