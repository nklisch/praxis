---
id: feature-refactor-async-chat-interactions-audit-step-8-pattern-doc
kind: story
stage: implementing
tags: [refactor, docs, patterns]
parent: feature-refactor-async-chat-interactions-audit
depends_on: [feature-refactor-async-chat-interactions-audit-step-3-assignment-submit-async, feature-refactor-async-chat-interactions-audit-step-4-course-materialize-pip, feature-refactor-async-chat-interactions-audit-step-5-document-attach-pip]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 8: Codify the `optimistic-dispatch` pattern

## Scope
Once at least 3 per-surface refactors have landed and the shape has proven itself, write the canonical pattern doc at `.claude/skills/patterns/optimistic-dispatch.md` and update the patterns index.

## Implementation
- Create `.claude/skills/patterns/optimistic-dispatch.md`:
  - When to apply (any UI affordance triggering engine / chat / IPC work)
  - Canonical signature: `useOptimisticAction<TParams>({ dispatch, onSuccess?, onError?, resetSuccessAfterMs? })`
  - State machine diagram (idle → pending → success/failed; failed → retrying)
  - Failure-tier model (inline first, strip after threshold via `useActionEscalation`)
  - Retry semantics (captured params at trigger-time; same dispatch path)
  - file:line references to canonical examples from the landed refactors (assignment-card, course-create-tab-body, library-document-picker)
  - Gotchas: external-settle for streaming-event-driven completion, optimistic state reversion on failure, per-row vs per-surface hook instances
- Update `.claude/rules/patterns.md`:
  - Add new "Async dispatch patterns" section
  - Add entry: `optimistic-dispatch — Every UI affordance triggering engine work uses `useOptimisticAction` for state + `useActionEscalation` for activity-strip fallback → [optimistic-dispatch.md]`

## Acceptance Criteria
- [ ] Pattern doc written with all sections listed above
- [ ] At least 3 file:line canonical examples cited
- [ ] Index updated under "Async dispatch patterns"
- [ ] No code changes — doc-only

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 8
- Depends on steps 3, 4, 5 (three landed refactors to cite as examples)
