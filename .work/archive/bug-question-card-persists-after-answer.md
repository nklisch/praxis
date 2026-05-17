---
id: bug-question-card-persists-after-answer
kind: story
stage: done
tags: [bug, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-17
---

# Inline quick-check question card persists after answer is submitted

## Brief

The question card (inline quick-check / assessment card in the chat) remains visible after the student has submitted an answer, instead of collapsing or transitioning to a "answered" state. Expected behavior is that once the answer is recorded the card either disappears, shrinks to a compact summary row, or is otherwise visually retired so the chat scroll keeps moving. Worth checking the card component's state machine and what event (tool result? grade? episodic write?) is supposed to trigger the resolved state.

## Suspected area

`packages/ui/src/components/quick-check-card.tsx` (modified per git status) — the resolved-state transition is likely missing or wired to the wrong event. Verify whether `gradeQuickCheck` tool result, episodic `tool_result` event, or a state-machine timer is supposed to drive the transition.

## Acceptance criteria

- After the student submits an answer, the card visually retires (collapse to summary row OR hide) within one render tick of the grade being recorded.
- The chat scroll keeps moving past the card naturally.
- A unit/integration test pins the post-answer state.

## Implementation notes

**Root cause**: The original `QuickCheckCard` had a `submitted` state flag but the `if (submitted)` branch only rendered a basic locked form — it was missing the collapsed summary view, and the answer/correctness data needed to populate it. `setSubmitted(true)` fired correctly (after `await onResolve` resolved), but the rendered fallback was still the full question form body with inputs disabled rather than a retired summary row.

**Fix**: Implemented in commit `df9f1f2` as part of `epic-ui-rendering-stability-state-transitions-question-card-collapse`:
1. Added `lastAnswer: QuickCheckAnswer | null`, `correct: boolean | null`, and `expanded: boolean` state alongside `submitted`.
2. Captures `setLastAnswer(answer)` and `setCorrect(gradeAnswer(item, answer))` between `await onResolve` and `setSubmitted(true)` in `handleSubmit`.
3. The `if (submitted)` early return now renders a compact summary `<button>` with `aria-expanded`, displaying the question stem, student's answer summary, and a ✓/✗ badge (or no badge for ungraded items). Clicking toggles a read-only details block.
4. Client-side `gradeAnswer(item, answer)` helper mirrors server-side grading logic per item kind.

**Event path**: No engine event subscription needed — retirement is driven purely by the `onResolve` promise resolving (the IPC `praxis.quickCheck.resolve` call completing). No bridge changes were required.

**Test coverage**: `packages/ui/src/__tests__/quick-check-card.test.tsx` — 11 tests pass, including "retires to a collapsed summary row after submission", correct/incorrect badge tests, toggle behaviour, and validation guards. Test file: `packages/ui/src/__tests__/quick-check-card.test.tsx` line 62.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode confirmation. Underlying fix (collapsed summary row + `gradeAnswer` helper + `lastAnswer`/`correct`/`expanded` state) shipped in `df9f1f2`. Today's commit `4c67b31` verifies the 11 existing tests including "retires to a collapsed summary row after submission" at `quick-check-card.test.tsx:62`. No new code change required.
