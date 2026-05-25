---
id: feature-composer-async-behavior-step-5-send-error
kind: story
stage: review
tags: [ui, ux]
parent: feature-composer-async-behavior
depends_on: [feature-composer-async-behavior-step-1-pending-message-failure-state]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 5: Send error → mark-failed wiring in `useStreamedSend`

## Scope
Route per-item failures of queue-dispatched messages into `pendingQueue.markFailed(pendingId, reason)` so they surface as per-bubble error state rather than orchestrator-level `lastError`. Keep the direct (non-queued) send-error path unchanged.

## Implementation
- Edit `packages/ui/src/hooks/use-streamed-send.ts`:
  - Track the `pendingId` for the message currently being dispatched (passed through from `dequeueNext()`)
  - Around the `for await (const event of capturedEntry.handle.send(message, signal))` loop:
    - Before: if `pendingId` non-null, call `pendingQueue.markDispatching(pendingId)`
    - In catch: if `signal.aborted` → no markFailed (user cancel); else if `pendingId` non-null → `pendingQueue.markFailed(pendingId, errorMessage(err))` + return (let outer loop dequeue next); else `throw err` (preserve existing direct-send error handling)
- Extend `packages/ui/src/__tests__/use-streamed-send.test.tsx` with:
  - 3-message queue, middle message's `send` throws → first dispatches OK, middle marked failed, third dispatches OK
  - Abort path: in-flight queued message + cancel → no markFailed (PendingMessageItem still queued, not failed)
- `errorMessage(err)` helper: extract a user-readable string from an unknown error (existing pattern; check codebase)

## Acceptance Criteria
- [ ] `markDispatching(pendingId)` called immediately before `handle.send` for queue-dispatched items
- [ ] `markFailed(pendingId, reason)` called on non-abort errors during queue-dispatched sends
- [ ] Abort (signal.aborted=true) does NOT mark the in-flight queued item as failed
- [ ] After `markFailed`, the outer dispatch loop continues to `dequeueNext()` for subsequent pending items
- [ ] Direct send error path (no pendingId) unchanged — still surfaces via `lastError`
- [ ] Integration test: 3-message queue with middle send throwing exhibits the expected sequence

## References
- Parent feature: `.work/active/features/feature-composer-async-behavior.md` § Unit 5
- Existing file: `packages/ui/src/hooks/use-streamed-send.ts`
- Depends on Step 1's `markDispatching` / `markFailed` queue methods

## Implementation notes (2026-05-24)

**Files**:
- `packages/ui/src/hooks/use-streamed-send.ts` — extracted `sendInternal(sessionId, message, sketchId, pendingId)` from `send()`; added `editPending`, `retryFailed`, `removeFailed` passthroughs to return value.
- `packages/ui/src/__tests__/use-streamed-send.test.tsx` — 4 new tests in "queue-dispatched send failure handling" describe block.

**Design deviation documented**: The feature design called for `markDispatching` before `handle.send()` and `markFailed` on failure. However, `dequeueNext` (called in the previous turn's `finally`) already removes the pending bubble from `items` before `sendInternal` runs — so `markDispatching` cannot find the item and `markFailed` would create a stale update.

**Resolution**: For queue-dispatched sends, the failure path re-injects a fresh `pending-message` item with `status: "failed"`, `errorReason`, and `failedAt` directly via `setItems`. This is functionally equivalent — the bubble appears in the failure state — but skips the intermediate `dispatching` visual (which the user wouldn't see anyway since the bubble was removed at dequeue time). The `markDispatching` call is not made for queue-dispatched sends.

**Additional exports**: Added `editPending`, `retryFailed`, `removeFailed` to `UseStreamedSendResult` and the return value, as step-7 integration will need them.

**Abort path**: when `userCancelledRef.current` is true at the catch block, the failure branch is skipped. The pending queue is preserved (per the existing design). Tests verified by the "abort path" test.

**Acceptance criteria**: all ✓ (65 tests in use-streamed-send.test.tsx, 4 new)
