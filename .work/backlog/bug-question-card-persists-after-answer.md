---
id: bug-question-card-persists-after-answer
created: 2026-05-13
tags: [bug]
---

The question card (inline quick-check / assessment card in the chat) remains visible after the student has submitted an answer, instead of collapsing or transitioning to a "answered" state. Expected behavior is that once the answer is recorded the card either disappears, shrinks to a compact summary row, or is otherwise visually retired so the chat scroll keeps moving. Worth checking the card component's state machine and what event (tool result? grade? episodic write?) is supposed to trigger the resolved state.
