import type {
  EpisodicEvent,
  Note,
  ProposedCourse,
  RetrievalCitation,
  Timestamp,
  ToolResult,
} from "@praxis/core/types";
import { getToolLabel } from "@praxis/tools/labels";
import type { ReviewCard } from "../components/flashcard-review.js";
import type { ChatStreamItem, SystemNoteItem, ToolEntryItem } from "./use-streamed-send.js";

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

/** Mutable state threaded through all per-event helpers in one replay pass. */
interface ReplayState {
  items: ChatStreamItem[];
  counter: number;
  currentAssistantId: string | null;
  lastAssistantId: string | null;
  activeBubbleContent: string;
  pendingByCallId: Map<string, string>;
  pendingCitations: RetrievalCitation[];
  pendingDrafts: ProposedCourse[];
  pendingNotes: Note[];
  pendingDueCards: ReviewCard[];
}

function nextId(state: ReplayState, kind: "user" | "asst"): string {
  return `hist-${kind}-${++state.counter}`;
}

/**
 * Open a new assistant bubble, draining any pending renderables into it
 * immediately (Unit 3: renderables belong to the FIRST bubble after the tool).
 */
function openBubble(state: ReplayState): string {
  const id = nextId(state, "asst");
  state.activeBubbleContent = "";
  const hasCitations = state.pendingCitations.length > 0;
  const hasDrafts = state.pendingDrafts.length > 0;
  const hasNotes = state.pendingNotes.length > 0;
  const hasDueCards = state.pendingDueCards.length > 0;
  const newItem: ChatStreamItem = {
    kind: "message",
    id,
    role: "assistant",
    content: "",
    rawContent: "",
    streaming: false,
    ...(hasCitations && { citations: [...state.pendingCitations] }),
    ...(hasDrafts && { drafts: [...state.pendingDrafts] }),
    ...(hasNotes && { notes: [...state.pendingNotes] }),
    ...(hasDueCards && { dueCards: [...state.pendingDueCards] }),
  };
  if (hasCitations) state.pendingCitations.length = 0;
  if (hasDrafts) state.pendingDrafts.length = 0;
  if (hasNotes) state.pendingNotes.length = 0;
  if (hasDueCards) state.pendingDueCards.length = 0;
  state.items.push(newItem);
  state.currentAssistantId = id;
  state.lastAssistantId = id;
  return id;
}

/** Close the current bubble (no-op if none open). */
function closeBubble(state: ReplayState): void {
  if (state.currentAssistantId === null) return;
  // Replay bubbles are never "streaming"; nothing to update on the item.
  state.currentAssistantId = null;
}

/** Drain pending renderables into an already-pushed assistant bubble item. */
function drainPendingInto(state: ReplayState, targetId: string): void {
  if (
    state.pendingCitations.length === 0 &&
    state.pendingDrafts.length === 0 &&
    state.pendingNotes.length === 0 &&
    state.pendingDueCards.length === 0
  ) {
    return;
  }
  for (let i = state.items.length - 1; i >= 0; i--) {
    const it = state.items[i];
    if (it?.kind === "message" && it.id === targetId) {
      if (state.pendingCitations.length > 0) {
        it.citations = [...(it.citations ?? []), ...state.pendingCitations];
        state.pendingCitations.length = 0;
      }
      if (state.pendingDrafts.length > 0) {
        it.drafts = [...(it.drafts ?? []), ...state.pendingDrafts];
        state.pendingDrafts.length = 0;
      }
      if (state.pendingNotes.length > 0) {
        it.notes = [...(it.notes ?? []), ...state.pendingNotes];
        state.pendingNotes.length = 0;
      }
      if (state.pendingDueCards.length > 0) {
        it.dueCards = [...(it.dueCards ?? []), ...state.pendingDueCards];
        state.pendingDueCards.length = 0;
      }
      break;
    }
  }
}

/**
 * Seal any open reasoning block in the items array (walk backward, stop at
 * user message boundary). Called on tool_call, model_message, and interrupted.
 */
function closeReasoningBlock(state: ReplayState): void {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const it = state.items[i];
    if (it?.kind === "thinking") {
      it.streaming = false;
      break;
    }
    if (it?.kind === "message" && it.role === "user") break;
  }
}

/**
 * Harvest renderable results from a successful tool_result into the pending
 * arrays so they drain into the next assistant bubble (Unit 3 placement rule).
 */
function harvestToolResult(
  state: ReplayState,
  toolName: string | undefined,
  value: ToolResultValue,
): void {
  if (toolName === "retrieve_from_documents") {
    const v = value as { citations?: RetrievalCitation[] } | undefined;
    if (v?.citations && Array.isArray(v.citations)) {
      state.pendingCitations.push(...v.citations);
    }
  } else if (toolName === "course.show_draft") {
    const v = value as
      | { kind: "ok"; draft: { proposed: ProposedCourse } }
      | { kind: "not_found" }
      | undefined;
    if (v?.kind === "ok" && v.draft?.proposed) state.pendingDrafts.push(v.draft.proposed);
  } else if (toolName === "note.show") {
    const v = value as { kind: "ok"; note: Note } | { kind: "not_found" } | undefined;
    if (v?.kind === "ok" && v.note) state.pendingNotes.push(v.note);
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
    if (v?.ok && Array.isArray(v.cards)) state.pendingDueCards.push(...v.cards);
  }
}

/**
 * Push the appropriate item for a tool_call event (sub-agent block, tool-entry,
 * or nothing for hidden tools). Caller has already called closeBubble and
 * registered the callId in pendingByCallId.
 */
function pushToolCallItem(
  state: ReplayState,
  toolName: string,
  callId: string,
  args: unknown,
): void {
  const label = getToolLabel(toolName);
  if (label.spawnsSubAgent === true) {
    state.items.push({ kind: "sub-agent", callId, toolName, status: "in_flight" });
  } else if (!label.hidden) {
    // Push as settled immediately — history is settled by definition.
    // firstSeenAt is 0 for historical items (no pacing needed).
    const toolEntry: ToolEntryItem = {
      callId,
      toolName,
      status: "settled",
      firstSeenAt: 0,
      input: args,
    };
    state.items.push({ kind: "tool-entry", ...toolEntry });
  }
}

/**
 * Settle the tool-entry or sub-agent item that matches callId, updating its
 * status and output/errorMessage fields in-place via index replacement.
 */
function settleToolEntry(state: ReplayState, callId: string, result: ToolResult): void {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    if (item?.kind === "tool-entry" && item.callId === callId) {
      if (result.ok) {
        state.items[i] = {
          ...item,
          status: "settled",
          ...(result.value !== undefined && { output: result.value }),
        };
      } else {
        state.items[i] = { ...item, status: "errored", errorMessage: result.error.message };
      }
      break;
    }
    if (item?.kind === "sub-agent" && item.callId === callId) {
      state.items[i] = {
        ...item,
        status: "settled",
        ...(result.ok === false && { errored: true }),
      };
      break;
    }
  }
}

/**
 * Apply model_message content (partial accumulation or full replace) to the
 * current open bubble and seal it if the message is non-partial.
 */
function applyModelMessage(
  state: ReplayState,
  content: string,
  partial: boolean | undefined,
): void {
  if (state.currentAssistantId === null) openBubble(state);
  if (partial === true) {
    state.activeBubbleContent += content;
  } else {
    state.activeBubbleContent = content;
  }
  const targetId = state.currentAssistantId;
  for (let i = state.items.length - 1; i >= 0; i--) {
    const it = state.items[i];
    if (it?.kind === "message" && it.id === targetId) {
      it.content = state.activeBubbleContent;
      it.rawContent = state.activeBubbleContent;
      break;
    }
  }
  if (partial !== true) {
    // Non-partial seals this bubble; next model_message opens a new one.
    closeBubble(state);
  }
  closeReasoningBlock(state);
}

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
 * - `system_note` → close bubble, push a `system-note` item.
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
  const state: ReplayState = {
    items: [],
    counter: 0,
    currentAssistantId: null,
    lastAssistantId: null,
    activeBubbleContent: "",
    pendingByCallId: new Map(),
    pendingCitations: [],
    pendingDrafts: [],
    pendingNotes: [],
    pendingDueCards: [],
  };

  let currentTurn: number | null = null;

  for (const ep of events) {
    const turnIndex = ep.source.turnIndex;
    if (currentTurn !== null && turnIndex !== currentTurn) {
      // Turn boundary detected via turnIndex change — close any open bubble.
      closeBubble(state);
    }
    currentTurn = turnIndex;
    const event = ep.event;

    switch (event.type) {
      case "user_message":
        // User message is a strong boundary — close any prior assistant bubble.
        closeBubble(state);
        state.items.push({
          kind: "message",
          id: nextId(state, "user"),
          role: "user",
          content: event.content,
          rawContent: event.content,
        });
        break;

      case "thinking": {
        // Reuse or open a reasoning block.
        const lastItem = state.items[state.items.length - 1];
        if (lastItem?.kind === "thinking" && lastItem.streaming) {
          lastItem.content += event.content;
        } else {
          state.items.push({
            kind: "thinking",
            id: nextId(state, "asst"),
            content: event.content,
            streaming: true, // will be sealed at turn boundary or next model_message
          });
        }
        break;
      }

      case "model_message":
        // Lazily open a bubble on first model_message; seal on non-partial.
        applyModelMessage(state, event.content, event.partial);
        break;

      case "tool_call": {
        // tool_call is a bubble boundary.
        closeBubble(state);
        const { toolName, callId } = event;
        // Always track for result harvesting, even for hidden tools.
        state.pendingByCallId.set(callId, toolName);
        pushToolCallItem(state, toolName, callId, event.args);
        closeReasoningBlock(state);
        break;
      }

      case "tool_result": {
        const { callId } = event;
        const toolName = state.pendingByCallId.get(callId);
        state.pendingByCallId.delete(callId);
        settleToolEntry(state, callId, event.result);
        if (!event.result.ok) break;
        harvestToolResult(state, toolName, event.result.value as ToolResultValue);
        break;
      }

      case "system_note": {
        // system_note acts as a bubble boundary and renders as a visible card.
        closeBubble(state);
        const noteItem: SystemNoteItem = {
          kind: "system-note",
          id: nextId(state, "user"), // reuse counter; "user" prefix keeps ids unique
          content: event.content,
          origin: event.origin,
        };
        state.items.push(noteItem);
        break;
      }

      case "final":
      case "error":
        // final terminates the turn; error is not surfaced in replay.
        closeBubble(state);
        break;

      case "interrupted":
        // interrupted terminates the turn (user cancel); close any open bubble.
        closeBubble(state);
        state.items.push({ kind: "cancel-marker", id: nextId(state, "asst") });
        closeReasoningBlock(state);
        break;
    }
  }

  // End-of-stream: close any open bubble.
  closeBubble(state);

  // Drain any remaining pending renderables into the most-recent assistant
  // bubble (fallback: tool was the last thing and no subsequent bubble opened).
  if (state.lastAssistantId !== null) {
    drainPendingInto(state, state.lastAssistantId);
  }

  return state.items;
}
