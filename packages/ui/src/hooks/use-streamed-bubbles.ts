import type { Note, ProposedCourse, RetrievalCitation } from "@praxis/core/types";
import { useRef } from "react";
import type { ReviewCard } from "../components/flashcard-review.js";
import type { ChatStreamItem } from "./use-streamed-send.js";

/** Renderables to attach when opening a new assistant bubble. */
export interface BubbleRenderables {
  citations?: RetrievalCitation[];
  drafts?: ProposedCourse[];
  notes?: Note[];
  dueCards?: ReviewCard[];
}

/**
 * Setter for the items list — matches the React `useState` dispatch signature
 * so stable `setItems` from `useStreamedSend` can be passed directly.
 */
type SetItems = (updater: (prev: ChatStreamItem[]) => ChatStreamItem[]) => void;

/** Imperative API returned by `useStreamedBubbles`. */
export interface StreamedBubblesApi {
  /**
   * Open a new assistant bubble. Accepts pre-drained renderables to attach.
   * Returns the new bubble id.
   */
  openAssistantBubble: (renderables?: BubbleRenderables) => string;
  /**
   * Close the current bubble (no-op if none open).
   * Marks the bubble's `streaming` flag as `false`.
   */
  closeAssistantBubble: () => void;
  /**
   * Append a content delta to the active bubble.
   * Does NOT open a bubble — caller must call `openAssistantBubble` first.
   */
  appendContent: (delta: string, setItems: SetItems) => void;
  /**
   * Replace the active bubble's content with a final snapshot.
   * Used for non-partial `model_message` events.
   */
  setContent: (content: string, setItems: SetItems) => void;
  /**
   * Current accumulated content length for the active bubble.
   * Used for the `activeBubbleContent.length > 0` thinking-guard check.
   */
  readonly activeBubbleContentLength: number;
  /**
   * Id of the currently open assistant bubble (null if none open).
   */
  readonly currentAssistantId: string | null;
  /**
   * Id of the most-recently opened assistant bubble.
   * Used in the `finally` block fallback renderable drain.
   */
  readonly lastAssistantId: string | null;
  /**
   * Reset per-turn locals. Call at the start of each `send()` turn.
   */
  reset: () => void;
}

/** Per-turn mutable locals stored in a single ref to avoid re-renders. */
interface BubbleRef {
  content: string;
  currentId: string | null;
  lastId: string | null;
}

let bubbleCounter = 0;
function nextBubbleId(): string {
  return `msg-${++bubbleCounter}`;
}

/**
 * Manages the assistant-bubble open/close/split lifecycle for a streaming turn.
 *
 * Per-turn state (`activeBubbleContent`, `currentAssistantId`, `lastAssistantId`)
 * lives in a single `useRef` object so it is mutated without triggering re-renders.
 * Call `reset()` at the start of each turn.
 *
 * Renderable draining is the caller's responsibility — pass pre-drained
 * renderables via the optional `renderables` argument to `openAssistantBubble`.
 */
export function useStreamedBubbles(
  setItems: SetItems,
  setThinking: (v: boolean) => void,
): StreamedBubblesApi {
  const bubbleRef = useRef<BubbleRef>({ content: "", currentId: null, lastId: null });

  const openAssistantBubble = (renderables?: BubbleRenderables): string => {
    const id = nextBubbleId();
    bubbleRef.current.content = "";
    bubbleRef.current.currentId = id;
    bubbleRef.current.lastId = id;

    const hasCitations = (renderables?.citations?.length ?? 0) > 0;
    const hasDrafts = (renderables?.drafts?.length ?? 0) > 0;
    const hasNotes = (renderables?.notes?.length ?? 0) > 0;
    const hasDueCards = (renderables?.dueCards?.length ?? 0) > 0;

    const newBubble: ChatStreamItem = {
      kind: "message",
      id,
      role: "assistant",
      content: "",
      rawContent: "",
      streaming: true,
      ...(hasCitations && { citations: [...(renderables?.citations ?? [])] }),
      ...(hasDrafts && { drafts: [...(renderables?.drafts ?? [])] }),
      ...(hasNotes && { notes: [...(renderables?.notes ?? [])] }),
      ...(hasDueCards && { dueCards: [...(renderables?.dueCards ?? [])] }),
    };

    setItems((prev) => [...prev, newBubble]);
    return id;
  };

  const closeAssistantBubble = (): void => {
    const id = bubbleRef.current.currentId;
    if (id === null) return;
    bubbleRef.current.currentId = null;
    setItems((prev) =>
      prev.map((it) =>
        it.kind === "message" && it.id === id ? { ...it, streaming: false } : it,
      ),
    );
  };

  const appendContent = (delta: string, setItemsFn: SetItems): void => {
    bubbleRef.current.content += delta;
    const id = bubbleRef.current.currentId;
    const contentSnapshot = bubbleRef.current.content;
    if (contentSnapshot.length > 0) {
      setThinking(false);
    }
    setItemsFn((prev) =>
      prev.map((it) =>
        it.kind === "message" && it.id === id
          ? { ...it, content: contentSnapshot, rawContent: contentSnapshot, streaming: true }
          : it,
      ),
    );
  };

  const setContent = (content: string, setItemsFn: SetItems): void => {
    bubbleRef.current.content = content;
    const id = bubbleRef.current.currentId;
    const contentSnapshot = content;
    if (contentSnapshot.length > 0) {
      setThinking(false);
    }
    setItemsFn((prev) =>
      prev.map((it) =>
        it.kind === "message" && it.id === id
          ? { ...it, content: contentSnapshot, rawContent: contentSnapshot, streaming: true }
          : it,
      ),
    );
  };

  const reset = (): void => {
    bubbleRef.current.content = "";
    bubbleRef.current.currentId = null;
    bubbleRef.current.lastId = null;
  };

  return {
    openAssistantBubble,
    closeAssistantBubble,
    appendContent,
    setContent,
    get activeBubbleContentLength() {
      return bubbleRef.current.content.length;
    },
    get currentAssistantId() {
      return bubbleRef.current.currentId;
    },
    get lastAssistantId() {
      return bubbleRef.current.lastId;
    },
    reset,
  };
}
