import type { EngineEvent } from "@praxis/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStreamItem, PendingMessageItem } from "./use-streamed-send.js";

/** A pending message waiting in the queue to be sent once the current turn ends. */
export interface PendingMessage {
  id: string;
  content: string;
  sketchId?: string;
}

/** Stable setter for the chat item list — matches React.Dispatch<React.SetStateAction<ChatStreamItem[]>>. */
export type SetItems = React.Dispatch<React.SetStateAction<ChatStreamItem[]>>;

export interface PendingQueueResult {
  /** The current pending queue state (for pendingCount and rendering). */
  pendingQueue: PendingMessage[];
  /** Derived count of messages waiting in the queue (0 when nothing pending). */
  pendingCount: number;
  /** Ref mirror of pendingQueue — always up to date inside async closures. */
  pendingQueueRef: React.RefObject<PendingMessage[]>;
  /** Tracks whether the current cancel was user-initiated. Cleared at send() start. */
  userCancelledRef: React.RefObject<boolean>;
  /** Ref to the active iterator so cancel() can call .return() from outside the send closure. */
  iteratorRef: React.MutableRefObject<AsyncIterator<EngineEvent> | null>;
  /**
   * Enqueue a message while streaming. Appends a pending-message item to setItems
   * so the user sees a faded bubble inline in the thread.
   */
  enqueue: (msg: PendingMessage, setItems: SetItems) => void;
  /**
   * Remove a pending entry from the queue and the item list.
   * No-op if the id is not found.
   */
  cancelPending: (pendingId: string, setItems: SetItems) => void;
  /**
   * Mark user-initiated cancel and call iter.return().
   * Per the queue design: cancel preserves pending messages rather than flushing
   * them — the user signalled intent to stop this turn.
   */
  cancel: () => void;
  /**
   * Called from the finally block. If not user-cancelled and the queue is non-empty,
   * dequeues the first entry (updating both ref and state), removes its pending bubble
   * from the item list via setItems, and returns the entry so the caller can invoke
   * send() in a setTimeout(0). Returns null if cancelled or queue is empty.
   */
  dequeueNext: (setItems: SetItems) => PendingMessage | null;
}

/**
 * Manages the pending-message queue for `useStreamedSend`.
 *
 * Encapsulates:
 * - `pendingQueue` React state + `pendingQueueRef` mirror
 * - `userCancelledRef` — set in cancel(), cleared by caller at send() start
 * - `iteratorRef` — written by the send() loop, read by cancel()
 * - `enqueue`, `cancelPending`, `cancel`, `dequeueNext` primitives
 *
 * `setItems` is accepted at each call site (not captured at construction) so there
 * are no stale-closure issues with the async send() loop.
 */
export function usePendingQueue(): PendingQueueResult {
  const [pendingQueue, setPendingQueue] = useState<PendingMessage[]>([]);

  // Ref mirror so the finally block always reads the latest value without
  // depending on stale closure capture from the start of the send() call.
  const pendingQueueRef = useRef<PendingMessage[]>([]);
  useEffect(() => {
    pendingQueueRef.current = pendingQueue;
  }, [pendingQueue]);

  // Tracks whether the current cancel was user-initiated. Set in cancel()
  // before .return(), cleared at the start of send(). The finally block
  // reads this to decide whether to auto-flush pending messages.
  const userCancelledRef = useRef(false);

  // Ref to the active iterator so cancel() can call .return() from outside the send closure.
  const iteratorRef = useRef<AsyncIterator<EngineEvent> | null>(null);

  const enqueue = useCallback((msg: PendingMessage, setItems: SetItems): void => {
    setPendingQueue((prev) => [...prev, msg]);
    setItems((prev) => [
      ...prev,
      {
        kind: "pending-message",
        id: msg.id,
        role: "user",
        content: msg.content,
        ...(msg.sketchId !== undefined && { sketchId: msg.sketchId }),
      } satisfies PendingMessageItem,
    ]);
  }, []);

  const cancelPending = useCallback((pendingId: string, setItems: SetItems): void => {
    setPendingQueue((prev) => {
      const next = prev.filter((p) => p.id !== pendingId);
      pendingQueueRef.current = next;
      return next;
    });
    setItems((prev) =>
      prev.filter((it) => !(it.kind === "pending-message" && it.id === pendingId)),
    );
  }, []);

  const cancel = useCallback((): void => {
    // Mark user-initiated before .return() so the finally block can detect it.
    userCancelledRef.current = true;
    iteratorRef.current?.return?.();
  }, []);

  const dequeueNext = useCallback((setItems: SetItems): PendingMessage | null => {
    // If the user explicitly cancelled, preserve the queue.
    if (userCancelledRef.current) return null;

    const queue = pendingQueueRef.current;
    if (queue.length === 0) return null;

    const [next, ...rest] = queue;
    // Eagerly update both ref and state so cancelPending sees the new queue.
    pendingQueueRef.current = rest;
    setPendingQueue(rest);

    if (next === undefined) return null;

    // Remove the pending bubble for this message (it will become a real
    // user bubble in the recursive send call).
    setItems((prev) =>
      prev.filter((it) => !(it.kind === "pending-message" && it.id === next.id)),
    );

    return next;
  }, []);

  return {
    pendingQueue,
    pendingCount: pendingQueue.length,
    pendingQueueRef,
    userCancelledRef,
    iteratorRef,
    enqueue,
    cancelPending,
    cancel,
    dequeueNext,
  };
}
