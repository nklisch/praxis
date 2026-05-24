---
id: feature-composer-async-behavior-step-1-pending-message-failure-state
kind: story
stage: implementing
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
