import type { EngineEvent } from "@praxis/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStreamItem, PendingMessageItem } from "./use-streamed-send.js";

/** A pending message waiting in the queue to be sent once the current turn ends. */
export interface PendingMessage {
  id: string;
  text: string;
  sketchId?: string;
}

/** Stable setter for the chat item list — matches React.Dispatch<React.SetStateAction<ChatStreamItem[]>>. */
export type SetItems = React.Dispatch<React.SetStateAction<ChatStreamItem[]>>;

export interface PendingQueueResult {
  /** The current pending queue state (for rendering). */
  pendingQueue: PendingMessage[];
  /**
   * Count of messages waiting in the queue that have not yet been dispatched
   * (`status === "queued"`). This is the raw queue length and does NOT include
   * dispatching or failed items — those are tracked by `useStreamedSend` via
   * `derivePendingCounts`.
   */
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
  /**
   * Transition a pending item from `queued → dispatching`.
   * Warn-logs and no-ops if the item is not currently `queued`.
   */
  markDispatching: (id: string, setItems: SetItems) => void;
  /**
   * Transition a pending item from `dispatching → failed`.
   * Sets `errorReason` and `failedAt = Date.now()`.
   * Warn-logs and no-ops if the item is not currently `dispatching`.
   */
  markFailed: (id: string, errorReason: string, setItems: SetItems) => void;
  /**
   * Transition a pending item from `failed → queued`.
   * Clears `errorReason` and `failedAt`.
   * Returns `{ text, sketchId? }` so the caller can re-dispatch, or `null` if the
   * item is not currently `failed` (or not found).
   */
  retryFailed: (id: string, setItems: SetItems) => { text: string; sketchId?: string } | null;
  /**
   * Mutate the `text` of a `queued` item in place.
   * Warn-logs and no-ops if the item is `dispatching` or `failed`.
   */
  editPending: (id: string, newText: string, setItems: SetItems) => void;
  /**
   * Remove a `failed` item from the item list entirely.
   * Warn-logs and no-ops if the item is not `failed`.
   */
  removeFailed: (id: string, setItems: SetItems) => void;
}

/**
 * Derive `pendingCount` (queued + dispatching) and `failedCount` (failed)
 * from the items array. Called by `useStreamedSend` on every render so its
 * exposed counts are always in sync with the live items state.
 */
export function derivePendingCounts(items: readonly ChatStreamItem[]): {
  pendingCount: number;
  failedCount: number;
} {
  let pendingCount = 0;
  let failedCount = 0;
  for (const it of items) {
    if (it.kind !== "pending-message") continue;
    if (it.status === "queued" || it.status === "dispatching") {
      pendingCount++;
    } else if (it.status === "failed") {
      failedCount++;
    }
  }
  return { pendingCount, failedCount };
}

/**
 * Manages the pending-message queue for `useStreamedSend`.
 *
 * Encapsulates:
 * - `pendingQueue` React state + `pendingQueueRef` mirror
 * - `userCancelledRef` — set in cancel(), cleared by caller at send() start
 * - `iteratorRef` — written by the send() loop, read by cancel()
 * - `enqueue`, `cancelPending`, `cancel`, `dequeueNext` primitives
 * - `markDispatching`, `markFailed`, `retryFailed`, `editPending`, `removeFailed`
 *   state-transition methods for the queued → dispatching → failed lifecycle
 *
 * `setItems` is accepted at each call site (not captured at construction) so there
 * are no stale-closure issues with the async send() loop.
 *
 * `pendingCount` on the returned object is the raw queue length (items not yet
 * dispatched). For the full pending+dispatching count and the failed count, use
 * `derivePendingCounts(items)` in the parent hook against the live items array.
 */
export function usePendingQueue(): PendingQueueResult {
  const [pendingQueue, setPendingQueue] = useState<PendingMessage[]>([]);

  // Ref mirror so the finally block always reads the latest value without
  // depending on stale closure capture from the start of the send() call.
  const pendingQueueRef = useRef<PendingMessage[]>([]);
  useEffect(() => {
    pendingQueueRef.current = pendingQueue;
  }, [pendingQueue]);

  // Tracks failed items by id so retryFailed can synchronously return the
  // item's params without depending on the setItems updater running first.
  // Updated in markFailed (add) and retryFailed / removeFailed (delete).
  const failedItemsRef = useRef<Map<string, { text: string; sketchId?: string }>>(new Map());

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
        text: msg.text,
        status: "queued",
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
    setItems((prev) => prev.filter((it) => !(it.kind === "pending-message" && it.id === next.id)));

    return next;
  }, []);

  const markDispatching = useCallback((id: string, setItems: SetItems): void => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.kind !== "pending-message" || it.id !== id) return it;
        if (it.status !== "queued") {
          console.warn(
            `[usePendingQueue] markDispatching: item ${id} is "${it.status}", expected "queued" — no-op`,
          );
          return it;
        }
        return { ...it, status: "dispatching" } satisfies PendingMessageItem;
      }),
    );
  }, []);

  const markFailed = useCallback((id: string, errorReason: string, setItems: SetItems): void => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.kind !== "pending-message" || it.id !== id) return it;
        if (it.status !== "dispatching") {
          console.warn(
            `[usePendingQueue] markFailed: item ${id} is "${it.status}", expected "dispatching" — no-op`,
          );
          return it;
        }
        // Record in the ref so retryFailed can read synchronously without
        // depending on the setItems updater running first.
        failedItemsRef.current.set(id, {
          text: it.text,
          ...(it.sketchId !== undefined && { sketchId: it.sketchId }),
        });
        return {
          ...it,
          status: "failed",
          errorReason,
          failedAt: Date.now(),
        } satisfies PendingMessageItem;
      }),
    );
  }, []);

  const retryFailed = useCallback(
    (id: string, setItems: SetItems): { text: string; sketchId?: string } | null => {
      // Read from the ref synchronously — this is populated by markFailed and
      // does not depend on the setItems updater having run yet.
      const captured = failedItemsRef.current.get(id) ?? null;
      if (captured === null) {
        // Item was never failed or already retried. Warn if the item exists in
        // items with wrong status (the setItems updater below will warn in that case).
        // For the return-value path we rely on the ref.
        setItems((prev) =>
          prev.map((it) => {
            if (it.kind !== "pending-message" || it.id !== id) return it;
            console.warn(
              `[usePendingQueue] retryFailed: item ${id} is "${it.status}", expected "failed" — no-op`,
            );
            return it;
          }),
        );
        return null;
      }
      failedItemsRef.current.delete(id);
      setItems((prev) =>
        prev.map((it) => {
          if (it.kind !== "pending-message" || it.id !== id) return it;
          if (it.status !== "failed") {
            // Should not happen if the ref is consistent — defensive log.
            console.warn(
              `[usePendingQueue] retryFailed: item ${id} is "${it.status}", expected "failed" — no-op`,
            );
            return it;
          }
          // Build a clean queued item — no errorReason, no failedAt.
          return {
            kind: "pending-message",
            id: it.id,
            text: it.text,
            status: "queued",
            ...(it.sketchId !== undefined && { sketchId: it.sketchId }),
          } satisfies PendingMessageItem;
        }),
      );
      return captured;
    },
    [],
  );

  const editPending = useCallback((id: string, newText: string, setItems: SetItems): void => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.kind !== "pending-message" || it.id !== id) return it;
        if (it.status !== "queued") {
          console.warn(
            `[usePendingQueue] editPending: item ${id} is "${it.status}", expected "queued" — no-op`,
          );
          return it;
        }
        return { ...it, text: newText } satisfies PendingMessageItem;
      }),
    );
    // Also update pendingQueue so the text is consistent if dequeueNext is called later.
    setPendingQueue((prev) => prev.map((p) => (p.id === id ? { ...p, text: newText } : p)));
  }, []);

  const removeFailed = useCallback((id: string, setItems: SetItems): void => {
    setItems((prev) => {
      const item = prev.find((it) => it.kind === "pending-message" && it.id === id);
      if (item !== undefined && item.kind === "pending-message" && item.status !== "failed") {
        console.warn(
          `[usePendingQueue] removeFailed: item ${id} is "${item.status}", expected "failed" — no-op`,
        );
        return prev;
      }
      // Clean up the failedItemsRef entry on successful removal.
      failedItemsRef.current.delete(id);
      return prev.filter((it) => !(it.kind === "pending-message" && it.id === id));
    });
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
    markDispatching,
    markFailed,
    retryFailed,
    editPending,
    removeFailed,
  };
}
