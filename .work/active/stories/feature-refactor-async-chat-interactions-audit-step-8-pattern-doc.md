---
id: feature-refactor-async-chat-interactions-audit-step-8-pattern-doc
kind: story
stage: done
tags: [refactor, docs, patterns]
parent: feature-refactor-async-chat-interactions-audit
depends_on: [feature-refactor-async-chat-interactions-audit-step-3-assignment-submit-async, feature-refactor-async-chat-interactions-audit-step-4-course-materialize-pip, feature-refactor-async-chat-interactions-audit-step-5-document-attach-pip]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-25
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
- [x] Pattern doc written with all sections listed above
- [x] At least 3 file:line canonical examples cited
- [x] Index updated under "Async dispatch patterns"
- [x] No code changes — doc-only

## Implementation notes (2026-05-25)

Created `.claude/skills/patterns/optimistic-dispatch.md` covering:
- When to apply (and when not to — modal destructive ops, useEffect loads, blocking navigations)
- Full hook signature with state machine ASCII diagram
- Two-tier failure model (inline pip → strip escalation)
- Four canonical examples with file:line refs:
  1. Basic dispatch — `assignment-card.tsx:68` (null-return throw pattern, `onError` → `setFailedAt`)
  2. External settle — `course-create-tab-body.tsx:115` (never-resolving Promise + `externalSettle` from stream handler)
  3. Per-row instances — `library-document-picker.tsx:50` (`DocumentPickerRow` sub-component + optimistic revert)
  4. Strip-only failure — `document-tab-body.tsx:285` (`useEffect`-based `failedAt` tracking, no inline pip)
- Escalation section covering `useActionEscalation` signature, per-item lifecycle, and `activity: null` degradation
- Seven gotchas and five anti-patterns

Updated `.claude/rules/patterns.md`: added "Async dispatch patterns" section above "UI data patterns" with the `optimistic-dispatch` entry.

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 8
- Depends on steps 3, 4, 5 (three landed refactors to cite as examples)

## Review (2026-05-25)

**Verdict**: Approve

**Notes**: Pattern doc + index entry shipped. Four canonical examples with file:line refs, two-tier failure model documented, 7 gotchas + 5 anti-patterns. Doc-only commit. The codification benefits future agents working on async-dispatch surfaces.
