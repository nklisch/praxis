---
id: feature-refactor-use-streamed-send-hook-decomposition-step-1-pending-queue
kind: story
stage: implementing
tags: [refactor, ui]
parent: feature-refactor-use-streamed-send-hook-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Extract `usePendingQueue`

## Goal

Move the pending-queue state machine out of `useStreamedSend` into a focused
`usePendingQueue` hook. This is the least-risky extraction: the state is fully
React-owned (`pendingQueue` / `setPendingQueue`), is not entangled with per-turn
local variables, and already has clear boundaries (`cancel`, `cancelPending`,
`pendingCount`, `pendingQueueRef`, `userCancelledRef`).

## Current state (in `use-streamed-send.ts`)

Lines 210–241 and 665–692 own this logic:

```ts
const [pendingQueue, setPendingQueue] = useState<PendingMessage[]>([]);
const pendingQueueRef = useRef<PendingMessage[]>([]);
useEffect(() => { pendingQueueRef.current = pendingQueue; }, [pendingQueue]);
const userCancelledRef = useRef(false);
const iteratorRef = useRef<AsyncIterator<EngineEvent> | null>(null);

const cancel = useCallback(...);
const cancelPending = useCallback(...);
// send() early-return path (lines 244–262): queue on isStreaming
// finally block (lines 665–692): read queue, dequeue, auto-flush
```

## Target state

New file: `packages/ui/src/hooks/use-pending-queue.ts`

```ts
export interface PendingQueueResult {
  pendingQueue: PendingMessage[];
  pendingCount: number;
  pendingQueueRef: React.RefObject<PendingMessage[]>;
  userCancelledRef: React.RefObject<boolean>;
  iteratorRef: React.RefObject<AsyncIterator<EngineEvent> | null>;
  /** Enqueue a message while streaming. Appends pending-message item to setItems. */
  enqueue: (msg: PendingMessage, setItems: SetItems) => void;
  /** Remove a pending entry from queue and item list. */
  cancelPending: (pendingId: string, setItems: SetItems) => void;
  /** Mark user-initiated cancel and call iter.return(). */
  cancel: () => void;
  /**
   * Called from finally. If not user-cancelled and queue is non-empty,
   * dequeues the next message and fires setTimeout(0, cb) with it.
   * Returns the dequeued entry (for the caller to remove its pending bubble
   * and call send recursively).
   */
  dequeueNext: (setItems: SetItems) => PendingMessage | null;
}
```

`SetItems` is `React.Dispatch<React.SetStateAction<ChatStreamItem[]>>` — passed
at call sites so the hook doesn't hold a stale closure.

`useStreamedSend` calls `usePendingQueue()` and replaces inline refs/state.
The `isStreaming` guard in `send()` becomes `if (isStreaming) { enqueue(...); return; }`.
The finally block auto-flush becomes `dequeueNext(setItems)`.

## Files affected

- `packages/ui/src/hooks/use-pending-queue.ts` — new file
- `packages/ui/src/hooks/use-streamed-send.ts` — replace inline queue code with hook

## Implementation notes

- `PendingMessage` interface must be re-exported from `use-pending-queue.ts`
  (or kept in `use-streamed-send.ts` and imported). Prefer keeping it in
  `use-streamed-send.ts` and importing the type into the new hook.
- `iteratorRef` lives here because `cancel()` calls `iter.return()`. The ref
  itself is set/cleared by the main `send()` loop — pass it back via the hook
  return so `send()` can write `iteratorRef.current = iter`.
- `userCancelledRef` is cleared in `send()` at turn start (`userCancelledRef.current = false`).
  The hook sets it in `cancel()`. Keep clear-on-send in the main hook body.
- The `setTimeout(0, () => void send(...))` in the auto-flush stays in `useStreamedSend`
  — `dequeueNext` returns the entry; the caller decides whether to re-invoke `send`.

## Acceptance

- All existing tests in `use-streamed-send.test.tsx` pass unchanged.
- `useStreamedSend` no longer declares `pendingQueue` state, `pendingQueueRef`,
  `userCancelledRef`, `iteratorRef`, `cancel`, or `cancelPending` inline.
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Risk + Rollback

**Risk: Low.** The queue state is fully orthogonal to the streaming path — the
only coupling points are: (a) `isStreaming` guard in `send()`, (b) the finally
auto-flush, (c) `iteratorRef` write in the main loop. All three are explicit
call-site handoffs.

**Rollback:** Revert the new file and restore the inlined code in
`use-streamed-send.ts`. No other packages affected.
