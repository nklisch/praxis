---
id: feature-refactor-async-chat-interactions-audit-step-2-action-escalation
kind: story
stage: implementing
tags: [ui, refactor]
parent: feature-refactor-async-chat-interactions-audit
depends_on: [feature-refactor-async-chat-interactions-audit-step-1-canonical-primitives]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
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
