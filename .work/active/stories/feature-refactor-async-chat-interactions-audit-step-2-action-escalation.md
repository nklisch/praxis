---
id: feature-refactor-async-chat-interactions-audit-step-2-action-escalation
kind: story
stage: done
tags: [ui, refactor]
parent: feature-refactor-async-chat-interactions-audit
depends_on: [feature-refactor-async-chat-interactions-audit-step-1-canonical-primitives]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-25
---

# Step 2: `useActionEscalation` — generalize the failure-escalation hook

## Scope
Create a generalized version of `useFailedEscalation` (from `feature-composer-async-behavior`) that escalates ANY optimistic-action failure to the activity strip after a threshold. Composes with `useOptimisticAction` to deliver the two-tier failure pattern (inline first, strip after ~30s).

## Implementation
- Create `packages/ui/src/hooks/use-action-escalation.ts`:
  - `useActionEscalation({ failedActions: Array<{ id, label, failedAt }>, activity?, thresholdMs = 30_000 }): void`
  - Mirrors `useFailedEscalation` from composer feature Unit 6; generalized over arbitrary action ids/labels
  - Per-id timer schedule + ActivityRegistry start on threshold + cleanup on retry/dismiss/unmount
- Tests using `vi.useFakeTimers()` (per `slow-test-gating` pattern):
  - Failure → advance time past threshold → activity.start called
  - Retry / dismiss before threshold → no activity.start (timer cleared)
  - Unmount before threshold → no leak
  - Re-failure of same id → fresh timer
  - No-op when `activity` is undefined
- Note: the composer feature's `useFailedEscalation` can become a thin wrapper around this hook post-landing — but that's a small follow-on, NOT part of this story.

## Acceptance Criteria
- [ ] Hook signature matches the documented shape
- [ ] Tests cover threshold timing, retry-cancels, unmount-cleanup, re-failure-reschedule, graceful no-op
- [ ] No regression on existing escalation behavior elsewhere
- [ ] Uses `activity-rail-producer` pattern correctly (`ctx.activity?.start({ label, metadata })`)

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 2
- Pattern: `.claude/skills/patterns/service-deps-injection.md` (activity-rail-producer)
- Depends on step-1 primitives

## Implementation notes (2026-05-24)

**File landed:** `packages/ui/src/hooks/use-action-escalation.ts`

Mirrors `useFailedEscalation` from `packages/ui/src/hooks/use-failed-escalation.ts` exactly, generalized to `failedActions: ReadonlyArray<{ id, label, failedAt }>` instead of `failedItems: PendingMessageItem[]`. The same two-`useEffect` pattern: one reactive on `failedActions` (schedules/clears timers), one cleanup-only (clears all on unmount). Uses `label` from the action (not a hardcoded string) in `activity.start({ label, metadata: { actionId } })`.

`ActivityRegistryClient` is re-exported from this file rather than imported from `use-failed-escalation.ts` — the two declarations are structurally identical; re-exporting keeps this hook self-contained and avoids an import direction that could feel surprising to callers.

Note for future: `useFailedEscalation` in the composer feature can become a thin wrapper over `useActionEscalation`. That's a small follow-on cleanup not in scope here.

**Test file:** `packages/ui/src/hooks/__tests__/use-action-escalation.test.tsx` — 10 tests covering threshold escalation, pre-threshold item removal, unmount cleanup, escalated-then-unmount (finish handle), re-failure rescheduling, multiple independent timers, and graceful no-op for null/undefined activity. All use `vi.useFakeTimers()`.

**All acceptance criteria met.**

## Review (2026-05-25)

**Verdict**: Approve

**Notes**: `useActionEscalation` mirrors `useFailedEscalation` template exactly, generalized to `{id, label, failedAt}` shape. `ActivityRegistryClient` re-exported (forward declaration), 10 tests with `vi.useFakeTimers()`. Bundled commit `e12402aa`.
