---
id: epic-ui-redesign-ground-up-chat-workspace-quiz-tab-body
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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

- [ ] QuizTabBody matches the locked mock layout.
- [ ] Item dispatch works per existing item-body types.
- [ ] No tutor messages mid-quiz.
- [ ] All quality checks green.
