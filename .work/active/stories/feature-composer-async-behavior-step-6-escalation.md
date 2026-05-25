---
id: feature-composer-async-behavior-step-6-escalation
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

# Step 6: `useFailedEscalation` — activity-strip escalation after threshold

## Scope
A small per-tab hook that watches `failedItems` and, for each failed message, schedules a `setTimeout`. If the user hasn't retried or removed by `thresholdMs` (default 30s) past `failedAt`, register an `ActivityRegistry` entry so the failure surfaces in the persistent status strip. Retry / remove cancels the timer; re-failure of the same id schedules fresh.

## Implementation
- Create `packages/ui/src/hooks/use-failed-escalation.ts` with:
  - `useFailedEscalation({ failedItems, activity, thresholdMs = 30_000 }): void`
  - `useRef<Map<string, { timer: ReturnType<typeof setTimeout>; handle?: ActivityHandle }>>` keyed by item id
  - `useEffect` reacts to `failedItems` (referenced by id+failedAt tuple for stability):
    - For new ids: schedule `setTimeout(thresholdMs - (Date.now() - failedAt), …)`
    - For disappeared ids: clearTimeout, finish handle if open
    - For same id but newer `failedAt`: clear + reschedule (treat as fresh)
  - On unmount: clear all timers + finish all open handles
  - When timer fires, call `activity?.start({ label, metadata: { messageId } })` and stash the returned handle
- Graceful degradation: when `activity` is `null`/`undefined`, do nothing (timers can still schedule + clear, but no registry calls)
- Create `packages/ui/src/__tests__/use-failed-escalation.test.tsx` with `vi.useFakeTimers()`:
  - Failure → advance time past threshold → activity.start called
  - Failure → retry (item disappears from failedItems) before threshold → no activity.start
  - Failure → unmount before threshold → no activity.start, no leaks
  - Re-failure of same id after retry → new timer scheduled

## Acceptance Criteria
- [ ] Activity entry created exactly `thresholdMs` after `failedAt` for an unattended failed item
- [ ] Retry / remove before threshold prevents activity entry (timer cleared)
- [ ] After threshold, activity entry persists until user resolves the failed bubble (finish called on transition out of failed)
- [ ] Re-failure of same id after retry schedules a fresh timer
- [ ] Hook cleans up all timers + activity handles on unmount
- [ ] Hook is a no-op when `activity` is `null`/`undefined`
- [ ] All assertions use `vi.useFakeTimers()` for deterministic timing

## References
- Parent feature: `.work/active/features/feature-composer-async-behavior.md` § Unit 6
- Pattern: `.claude/skills/patterns/service-deps-injection.md` (activity-rail-producer entry)
- Depends on Step 1's failure state types

## Implementation notes (2026-05-24)

**Files**:
- `packages/ui/src/hooks/use-failed-escalation.ts` (NEW)
- `packages/ui/src/__tests__/use-failed-escalation.test.tsx` (NEW, 14 tests)

**Type note**: The feature design referenced `ActivityRegistryClient` — a type that doesn't exist in the codebase (the server-side interface is `ActivityRegistry`; the renderer-side is `ActivityClient`). This story defines `ActivityRegistryClient` as a local interface in `use-failed-escalation.ts` with just the `start()` method from `ActivityRegistry`. It's exported so the caller (step-7) can satisfy it with whatever mechanism is available (future IPC call, or server-injected instance).

**`useRef<Map<id, EscalationEntry>>`**: Internal map tracks per-id `{ failedAt, timer, handle? }`. Two `useEffect`s: one reactive on `[failedItems, activity, thresholdMs]` that schedules/clears timers; one cleanup-only on `[]` that clears everything on unmount. This cleanly separates the "React lifecycle" concern from the "timer lifecycle" concern.

**Past-threshold items**: `Math.max(0, thresholdMs - elapsed)` ensures items that were already past threshold when the component first mounts escalate immediately on next tick (timer fires at 0ms).

**Timer closure**: `setTimeout` callback captures `capturedId` (not `item.id` directly) to avoid any closure issues with the loop variable. The callback checks `entries.has(capturedId)` to handle the race where the item disappears in the same tick the timer fires.

**Acceptance criteria**: all ✓ (14 tests, all deterministic with `vi.useFakeTimers()`)
