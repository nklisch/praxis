import type {
  EpisodicEvent,
  Note,
  ProposedCourse,
  RetrievalCitation,
  Timestamp,
} from "@praxis/core/types";
import { getToolLabel } from "@praxis/tools/labels";
import type { ReviewCard } from "../components/flashcard-review.js";
import type { ChatStreamItem, ToolEntryItem } from "./use-streamed-send.js";

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

/**
 * Reconstruct the rendered chat item log from a session's episodic events.
 *
 * Applies the same bubble-splitting boundary rule as `useStreamedSend.send`:
 * - `user_message` → emit a user message item.
 * - `model_message` → open a bubble lazily on first model_message; seal on
 *   non-partial (same rule as live streaming). `streaming` is always `false`
 *   in replay output — history is settled.
 * - `tool_call` → close the current bubble (boundary), push an interstitial
 *   (if not hidden), track in pendingByCallId.
 * - `tool_result` → settle the matching interstitial; harvest citations /
 *   drafts / notes / due-cards into pending arrays; they drain into the FIRST
 *   bubble that opens after the tool resolves (Unit 3 placement rule).
 * - `system_note` → close bubble, no item pushed.
 * - `final` / `error` → close bubble, no item pushed.
 *
 * Cross-cutting invariant: given the same EngineEvent sequence, this function
 * and `useStreamedSend.send` produce structurally identical items arrays (same
 * item kinds, roles, content, and renderable attachments). The parity test
 * suite enforces this.
 *
 * History errors are intentionally not rendered as banners — the user has
 * already moved past them, and surfacing every old failure on reload would be
 * noise. The live `lastError` channel handles errors from the active turn.
 */
export function episodicToItems(events: readonly EpisodicEvent[]): ChatStreamItem[] {
  const items: ChatStreamItem[] = [];
  let currentTurn: number | null = null;
  let counter = 0;
  const nextId = (kind: "user" | "asst") => `hist-${kind}-${++counter}`;

  // Bubble-pointer model — mirrors useStreamedSend.
  let currentAssistantId: string | null = null;
  let lastAssistantId: string | null = null;
  let activeBubbleContent = "";

  // callId → toolName — per-function scope (callIds are session-unique).
  const pendingByCallId = new Map<string, string>();

  // Pending renderables (Unit 3): drain into FIRST bubble after tool resolves.
  const pendingCitations: RetrievalCitation[] = [];
  const pendingDrafts: ProposedCourse[] = [];
  const pendingNotes: Note[] = [];
  const pendingDueCards: ReviewCard[] = [];

  /** Drain pending renderables into an already-pushed assistant bubble item. */
  const drainPendingInto = (targetId: string): void => {
    if (
      pendingCitations.length === 0 &&
      pendingDrafts.length === 0 &&
      pendingNotes.length === 0 &&
      pendingDueCards.length === 0
    ) {
      return;
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it?.kind === "message" && it.id === targetId) {
        if (pendingCitations.length > 0) {
          it.citations = [...(it.citations ?? []), ...pendingCitations];
          pendingCitations.length = 0;
        }
        if (pendingDrafts.length > 0) {
          it.drafts = [...(it.drafts ?? []), ...pendingDrafts];
          pendingDrafts.length = 0;
        }
        if (pendingNotes.length > 0) {
          it.notes = [...(it.notes ?? []), ...pendingNotes];
          pendingNotes.length = 0;
        }
        if (pendingDueCards.length > 0) {
          it.dueCards = [...(it.dueCards ?? []), ...pendingDueCards];
          pendingDueCards.length = 0;
        }
        break;
      }
    }
  };

  /**
   * Open a new assistant bubble, draining any pending renderables into it
   * immediately (Unit 3: renderables belong to the FIRST bubble after the tool).
   */
  const openBubble = (): string => {
    const id = nextId("asst");
    activeBubbleContent = "";
    // Pre-attach pending renderables to the new bubble before pushing.
    const hasCitations = pendingCitations.length > 0;
    const hasDrafts = pendingDrafts.length > 0;
    const hasNotes = pendingNotes.length > 0;
    const hasDueCards = pendingDueCards.length > 0;
    const newItem: ChatStreamItem = {
      kind: "message",
      id,
      role: "assistant",
      content: "",
      rawContent: "",
      streaming: false,
      ...(hasCitations && { citations: [...pendingCitations] }),
      ...(hasDrafts && { drafts: [...pendingDrafts] }),
      ...(hasNotes && { notes: [...pendingNotes] }),
      ...(hasDueCards && { dueCards: [...pendingDueCards] }),
    };
    if (hasCitations) pendingCitations.length = 0;
    if (hasDrafts) pendingDrafts.length = 0;
    if (hasNotes) pendingNotes.length = 0;
    if (hasDueCards) pendingDueCards.length = 0;
    items.push(newItem);
    currentAssistantId = id;
    lastAssistantId = id;
    return id;
  };

  /** Close the current bubble (no-op if none open). */
  const closeBubble = (): void => {
    if (currentAssistantId === null) return;
    // Replay bubbles are never "streaming"; nothing to update on the item.
    currentAssistantId = null;
  };

  for (const ep of events) {
    const turnIndex = ep.source.turnIndex;
    if (currentTurn !== null && turnIndex !== currentTurn) {
      // Turn boundary detected via turnIndex change — close any open bubble.
      closeBubble();
    }
    currentTurn = turnIndex;
    const event = ep.event;

    switch (event.type) {
      case "user_message":
        // User message is a strong boundary — close any prior assistant bubble.
        closeBubble();
        items.push({
          kind: "message",
          id: nextId("user"),
          role: "user",
          content: event.content,
          rawContent: event.content,
        });
        break;

      case "model_message": {
        // Lazily open a bubble on the first model_message.
        if (currentAssistantId === null) openBubble();
        if (event.partial === true) {
          activeBubbleContent += event.content;
        } else {
          activeBubbleContent = event.content;
        }
        // Mutate the bubble item in place (replay; fresh array, not React state).
        const targetId = currentAssistantId;
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          if (it?.kind === "message" && it.id === targetId) {
            it.content = activeBubbleContent;
            it.rawContent = activeBubbleContent;
            break;
          }
        }
        if (event.partial !== true) {
          // Non-partial seals this bubble; next model_message opens a new one.
          closeBubble();
        }
        break;
      }

      case "tool_call": {
        // tool_call is a bubble boundary.
        closeBubble();
        const { toolName, callId } = event;
        // Always track for result harvesting, even for hidden tools.
        pendingByCallId.set(callId, toolName);

        const label = getToolLabel(toolName);
        if (!label.hidden) {
          // Push as settled immediately — history is settled by definition.
          // firstSeenAt is set to 0 for historical items (no pacing needed).
          // input is populated at tool_call time; output is populated at tool_result.
          const toolEntry: ToolEntryItem = {
            callId,
            toolName,
            status: "settled",
            firstSeenAt: 0,
            input: event.args,
          };
          items.push({ kind: "tool-entry", ...toolEntry });
        }
        break;
      }

      case "tool_result": {
        const { callId } = event;
        const toolName = pendingByCallId.get(callId);
        pendingByCallId.delete(callId);

        // Populate output/errorMessage on the matching tool entry (walk from end for recency).
        for (let i = items.length - 1; i >= 0; i--) {
          const item = items[i];
          if (item?.kind === "tool-entry" && item.callId === callId) {
            const result = event.result;
            if (result.ok) {
              items[i] = {
                ...item,
                status: "settled",
                ...(result.value !== undefined && { output: result.value }),
              };
            } else {
              items[i] = {
                ...item,
                status: "errored",
                errorMessage: result.error.message,
              };
            }
            break;
          }
        }

        if (!event.result.ok) break;
        const value = event.result.value as ToolResultValue;

        // Harvest into pending arrays (Unit 3) — drain on next bubble open.
        if (toolName === "retrieve_from_documents") {
          const v = value as { citations?: RetrievalCitation[] } | undefined;
          if (v?.citations && Array.isArray(v.citations)) {
            pendingCitations.push(...v.citations);
          }
        } else if (toolName === "course.show_draft") {
          const v = value as
            | { kind: "ok"; draft: { proposed: ProposedCourse } }
            | { kind: "not_found" }
            | undefined;
          if (v?.kind === "ok" && v.draft?.proposed) pendingDrafts.push(v.draft.proposed);
        } else if (toolName === "note.show") {
          const v = value as { kind: "ok"; note: Note } | { kind: "not_found" } | undefined;
          if (v?.kind === "ok" && v.note) pendingNotes.push(v.note);
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
          if (v?.ok && Array.isArray(v.cards)) pendingDueCards.push(...v.cards);
        }
        break;
      }

      case "system_note":
        // system_note acts as a bubble boundary; not rendered as an item.
        closeBubble();
        break;

      case "final":
      case "error":
        // final terminates the turn; error is not surfaced in replay.
        closeBubble();
        break;

      case "interrupted":
        // interrupted terminates the turn (user cancel); close any open bubble.
        // The UI sibling story will add a visible cancellation indicator.
        closeBubble();
        break;
    }
  }

  // End-of-stream: close any open bubble.
  closeBubble();

  // Drain any remaining pending renderables into the most-recent assistant
  // bubble (fallback: tool was the last thing and no subsequent bubble opened).
  if (lastAssistantId !== null) {
    drainPendingInto(lastAssistantId);
  }

  return items;
}
