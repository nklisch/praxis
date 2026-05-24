import { useRef } from "react";
import type { ChatStreamItem } from "./use-streamed-send.js";

/** SetItems matches the React state setter for ChatStreamItem[]. */
type SetItems = React.Dispatch<React.SetStateAction<ChatStreamItem[]>>;

// Local id counter — mirrors the one in use-streamed-send.ts.
// Kept separate so this hook is self-contained; the two counters share the
// same module-level address space within the app bundle, so ids never collide.
let reasoningCounter = 0;
function nextReasoningId(): string {
  return `reasoning-${++reasoningCounter}`;
}

export interface ReasoningBlocksApi {
  /**
   * Handle a `thinking` event. Opens a new block if none is active,
   * otherwise appends to the active one.
   */
  onThinking: (content: string, setItems: SetItems) => void;
  /**
   * Close the active reasoning block (marks streaming: false). No-op if none open.
   */
  closeReasoningBlock: (setItems: SetItems) => void;
  /**
   * Called at turn start to reset the active block pointer.
   */
  reset: () => void;
}

interface ReasoningState {
  currentReasoningId: string | null;
}

/**
 * Manages the lifecycle of reasoning (thinking) blocks that appear above
 * assistant messages. A reasoning block opens on the first `thinking` event
 * of a turn, accumulates content on subsequent events, and is closed
 * (marked streaming: false) when text, a tool call, or interruption begins.
 *
 * Per-turn state is held in a `useRef` so no re-render is triggered on
 * open/close transitions — only `setItems` calls cause React updates.
 */
export function useReasoningBlocks(): ReasoningBlocksApi {
  const stateRef = useRef<ReasoningState>({ currentReasoningId: null });

  const reset = (): void => {
    stateRef.current.currentReasoningId = null;
  };

  const onThinking = (content: string, setItems: SetItems): void => {
    const state = stateRef.current;
    if (state.currentReasoningId === null) {
      // Open a new reasoning block.
      const id = nextReasoningId();
      state.currentReasoningId = id;
      setItems((prev) => [
        ...prev,
        { kind: "thinking", id, content, streaming: true },
      ]);
    } else {
      // Append to the active reasoning block.
      const id = state.currentReasoningId;
      setItems((prev) =>
        prev.map((it) =>
          it.kind === "thinking" && it.id === id
            ? { ...it, content: it.content + content }
            : it,
        ),
      );
    }
  };

  const closeReasoningBlock = (setItems: SetItems): void => {
    const state = stateRef.current;
    if (state.currentReasoningId === null) return;
    const id = state.currentReasoningId;
    state.currentReasoningId = null;
    setItems((prev) =>
      prev.map((it) =>
        it.kind === "thinking" && it.id === id ? { ...it, streaming: false } : it,
      ),
    );
  };

  return { onThinking, closeReasoningBlock, reset };
}
