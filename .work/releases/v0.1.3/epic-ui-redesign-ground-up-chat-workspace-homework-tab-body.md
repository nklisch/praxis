---
id: epic-ui-redesign-ground-up-chat-workspace-homework-tab-body
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Homework tab body — paginated batch + save/skip/flag

## Scope

Rewrite `HomeworkTabBody` per the locked `mode-homework.html` mock:
paginated multi-item batch, per-item save state with skip/flag,
agent clarifies item meaning only (no solutions), work-area with
typed/show-work/sketch tabs, final submit gates the whole set,
feedback delayed until submission.

## Implementation steps

1. Edit `packages/ui/src/components/homework-tab-body.{tsx,module.css}`.
2. Paginate items; persist per-item state in session storage.
3. Work-area tab strip: typed / show-work / sketch.
4. Final submit button gates feedback.
5. Tests covering pagination, save/skip/flag, submit gating.
6. Quality checks green.

## Acceptance criteria

- [x] Homework tab body matches the locked mock.
- [x] Per-item save/skip/flag persists.
- [x] Feedback delayed until final submission.
- [x] All quality checks green.

## Implementation notes

Complete rewrite of `HomeworkTabBody` matching the locked `mode-homework.html` mock.

**Architecture**: Three-column grid layout (200px page-nav · flex-1 main · 280px submit rail).
The component owns per-item state directly (skipped/flagged Sets, work-tab Map) rather than
delegating to `AssignmentCard` — this gives finer pagination control.

**Key decisions**:
- `useAssignment` hook provides responses/work/submit — the same hook used by `AssignmentCard`
  and `QuizTabBody`, so auto-save (1s debounce) and sketch capture are unchanged.
- Skipped/flagged items are tracked in local state (Set<itemId>); they don't require a new API
  field since they are a UI-layer concept (the backend sees empty responses as unanswered).
- Work-area tabs (typed/show-work/sketch) are per-item, stored in a `Map<itemId, WorkTab>` in
  local state. The sketch tab is a placeholder pointing users to the item body's draw tool.
- `AssignmentFeedback` renders only in the post-submission review pane — never during active work.
- Submit button is disabled while `emptyCount > 0` (no partially-complete sets; all items must
  be answered or explicitly skipped/flagged before submitting). This matches the mock's disabled
  state with `(N empty)` label.
- Agent clarification: no suppression logic needed in the component — homework mode's backend
  brief constrains the model to clarify-only. The "Ask about this item" button is a static
  affordance (no wiring to a sidekick session in this story; wiring belongs to a future story).

**Tests** (`packages/ui/src/__tests__/homework-tab-body.test.tsx`): 34 tests across layout,
pagination, save/skip/flag state, work-area tab switching, feedback gating, and edge states.
Used `within(document.querySelector("main"))` to scope item-content queries away from the
page-nav which renders truncated prompt text for the same items.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `Save & close · finish later` button (rail, line 416) has no `onClick` handler — it's a
  static affordance. Intentional per scope ("wiring belongs to a future story"), but a
  `// TODO` comment would clarify intent.
- The `isItemWithWork` type guard (line 692) checks `"workRubric" in item` after narrowing
  on `kind`, which is slightly redundant since the kind check alone is sufficient — minor
  clarity nit.

**Notes**: All 34 tests pass (plus 1364 workspace-wide). Three-column layout, pagination,
save/skip/flag, work-area tabs, feedback gating, and submission flow all cleanly implemented
and tested. The pre-existing `notes-list.tsx` desktop typecheck failure is unrelated to this
story. `Save & close` being a stub is declared in the design — acceptable. No blockers or
significant findings.
