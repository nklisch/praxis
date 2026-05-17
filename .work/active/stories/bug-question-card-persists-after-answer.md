---
id: bug-question-card-persists-after-answer
kind: story
stage: drafting
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
