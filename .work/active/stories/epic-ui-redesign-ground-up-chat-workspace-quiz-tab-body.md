---
id: epic-ui-redesign-ground-up-chat-workspace-quiz-tab-body
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

# Quiz tab body — item-typed cards, no tutor scaffolding

## Scope

Rewrite `QuizTabBody` per the locked `mode-quiz.html` mock: item-typed
cards (math-expression / single-choice / etc.), no tutor mid-quiz,
item-status rail on right.

The confidence band is added by sibling
`epic-backend-fills-for-redesign-ui-completion-bundle-quiz-confidence`;
this story is the surface restyle.

## Implementation steps

1. Edit `packages/ui/src/components/quiz-tab-body.{tsx,module.css}`.
2. Render item cards using existing `item-bodies/*` components within
   the new layout.
3. Item-status rail on right reflecting current/answered/skipped state.
4. Suppress tutor message rendering during the quiz (only show on
   completion / review).
5. Tests covering item dispatch, status rail, and tutor-suppression.
6. Quality checks green.

## Acceptance criteria

- [x] QuizTabBody matches the locked mock layout.
- [x] Item dispatch works per existing item-body types.
- [x] No tutor messages mid-quiz.
- [x] All quality checks green.

## Implementation notes

Rewrote `QuizTabBody` from an `AssignmentCard`-wrapper + sidekick-panel to the
locked `mode-quiz.html` spec:

**Layout.** Two-column CSS grid: center column (flexible, scrollable) and right
rail (280px fixed). Center shows the quiz head, mode-rule banner, current item
card, and a ghost preview of the next item. Rail shows item-status dots, item
kinds summary, and a timing note.

**No tutor.** Removed `SidekickPanel`, `useResizableWidth`, and the `?` toggle
entirely. The mode-rule banner explains the no-tutor policy in-surface.

**One item at a time.** State drives `currentIndex`; Skip / Submit answer advance
to the next unanswered/unskipped item. After all items are addressed, a
ready-to-submit panel appears with final submit + optional "return to skipped".

**Item-status rail.** Each item renders as a clickable `<li><button>` dot in an
`<ul>` (semantic list). States: `upcoming` (default), `current` (quiz tint
fill + box-shadow ring), `answered` (success green), `skipped` (warning amber).
Dots are clickable for direct navigation.

**Confidence band.** Preserved via `AssignmentItemCard`'s existing
`confidence` / `onConfidenceChange` props — no change to the confidence
infrastructure.

**Post-submit review.** After the final submit, the center column shows the
score + per-item review with `AssignmentFeedback` displayed below each item.

**Tests.** 20 tests across layout, tutor-suppression, item dispatch, rail
behaviour, navigation, and confidence. Updated the stale sidekick-focused tests
in `quiz-tab-body.test.tsx` and confirmed `chat-tab-body-dispatch.test.tsx`
still passes (the kickerMode glyph `‡` was separated into its own span so the
mode text stays exactly `"quiz"`).

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none

**Important**: UX.md § "quiz (flashcard rhythm)" still describes the pre-redesign
side-strip tutor summon ("`?`" key, agent visible between cards). The locked mock
and this implementation intentionally remove that affordance. `docs/UX.md` needs
rolling forward to reflect the no-tutor-mid-quiz contract. Filed as
`backlog-ux-md-quiz-mode-doc-drift`.

**Nits**:
- `"concept" in currentItem` check at `quiz-tab-body.tsx:248` is dead code —
  no `AssignmentItem` variant exposes a `concept` field. Silent no-op, no crash.
- `--color-warning: #ca8a04` fallback in `.dotSkipped` is redundant; token is
  defined in `global.css`. Harmless.
- `isItemWithWork` checks `"workRubric" in item` instead of just `item.kind` —
  overly conservative but correct.

**Notes**: Rewrite faithfully implements the locked mock. Layout, tutor
suppression, item dispatch, rail, confidence band, and post-submit review are
all present and tested. No correctness bugs found.
