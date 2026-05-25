---
id: feature-composer-async-behavior-step-1-pending-message-failure-state
kind: story
stage: done
tags: [ui, ux]
parent: feature-composer-async-behavior
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: PendingMessageItem failure-state + queue method extensions

## Scope
Extend the `PendingMessageItem` type with status / errorReason / failedAt fields, and add the queue methods that drive the queued → dispatching → failed → queued (retry) lifecycle. This is the type-layer foundation that Units 4–6 compose against.

## Implementation
- Locate the current `PendingMessageItem` definition (likely `packages/ui/src/types/items.ts` or sibling — grep `kind: "pending-message"`).
- Add fields per Unit 1 of the parent feature design:
  - `status: "queued" | "dispatching" | "failed"` (default `"queued"` on enqueue)
  - `errorReason?: string`
  - `failedAt?: number`
- Extend `packages/ui/src/hooks/use-pending-queue.ts` with new methods per Unit 1:
  - `markDispatching(id)`, `markFailed(id, reason)`, `retryFailed(id)`, `editPending(id, newText)`, `removeFailed(id)`
  - Add derived `failedCount` to the returned shape; ensure `pendingCount` excludes failed
- All state mutations go through `setItems` callback (no direct ref-mutation for status fields).
- Illegal state transitions warn-log via the project logger; never throw (graceful degradation).

## Acceptance Criteria
- [ ] PendingMessageItem has `status`, `errorReason`, `failedAt` fields with the documented types
- [ ] `markDispatching` transitions only `queued → dispatching`; warn-logs on mismatch
- [ ] `markFailed` transitions only `dispatching → failed`; sets `errorReason` + `failedAt`
- [ ] `retryFailed` transitions only `failed → queued`; clears error fields; returns `{ text, sketchId? }` for the caller
- [ ] `editPending` only mutates `queued` items; warn-logs otherwise
- [ ] `removeFailed` only removes `failed` items; warn-logs otherwise
- [ ] `pendingCount` derived from items (queued + dispatching); `failedCount` derived (failed only)
- [ ] `packages/ui/src/__tests__/use-pending-queue.test.tsx` covers every transition + every illegal-state warn path

## References
- Parent feature: `.work/active/features/feature-composer-async-behavior.md` § Unit 1
- Pattern: `.claude/skills/patterns/hook-decomposition-setitems-callback.md`
- Existing file: `packages/ui/src/hooks/use-pending-queue.ts`

## Implementation notes (2026-05-24)

### Files changed
- `packages/ui/src/hooks/use-streamed-send.ts` — Extended `PendingMessageItem` with `status: PendingMessageStatus`, `errorReason?: string`, `failedAt?: number`. Renamed `content → text` field. Added `PendingMessageStatus` type export. Added `failedCount` to `UseStreamedSendResult`. Imported and delegated to `derivePendingCounts` for the `pendingCount`/`failedCount` return values.
- `packages/ui/src/hooks/use-pending-queue.ts` — Renamed `PendingMessage.content → text`. Added `failedItemsRef` (a `Map<id, {text, sketchId?}>`) for synchronous `retryFailed` returns. Added `markDispatching`, `markFailed`, `retryFailed`, `editPending`, `removeFailed` methods. Added `derivePendingCounts` pure function. All transitions go through `setItems` callback; illegal states warn-log via `console.warn`.
- `packages/ui/src/components/chat-tab-body.tsx` — Updated `item.content → item.text` in pending-message render path.
- `packages/ui/src/__tests__/use-pending-queue.test.tsx` — NEW: 25 tests covering every transition, every warn path, and `derivePendingCounts`.
- `packages/ui/src/__tests__/use-streamed-send.test.tsx` — Updated assertion from `content`/`role` to `text`/`status`.

### Design decisions / discoveries
- **`retryFailed` synchronous return**: The `setItems` updater runs asynchronously (batched by React 18), so capturing a value inside it and returning it synchronously doesn't work. Fixed via `failedItemsRef` — `markFailed` populates it synchronously inside the updater (which runs within `act()`), and `retryFailed` reads from it before calling `setItems`.
- **`pendingCount` vs `failedCount`**: `usePendingQueue.pendingCount` reflects only the raw queue (pre-dispatch items). The accurate `pendingCount` (queued+dispatching) and `failedCount` (failed) are derived from the live `items` array via `derivePendingCounts` in `useStreamedSend` — no state duplication, no Strict Mode double-invocation bugs.
- **Field rename `content → text`**: Per design spec. Updated all consumers (chat-tab-body, use-pending-queue internals, use-streamed-send). The `role: "user"` field was also removed from `PendingMessageItem` as it's not in the spec and was unused in rendering.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: `PendingMessageItem` extended; queue hook gained 5 new methods; `derivePendingCounts` pure helper for accurate counts (avoids Strict Mode double-invocation). `failedItemsRef` for synchronous `retryFailed` return — sharp React-18 batching workaround. 25 new tests + field rename `content → text` propagated cleanly. Bundled commit `f0674d11`.
