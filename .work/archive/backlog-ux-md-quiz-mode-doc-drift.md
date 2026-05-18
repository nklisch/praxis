---
id: backlog-ux-md-quiz-mode-doc-drift
kind: story
stage: done
tags: [docs]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Roll UX.md quiz-mode section forward for no-tutor redesign

## Scope

`docs/UX.md` § "quiz (flashcard rhythm)" still describes the pre-redesign
affordance: "The agent is visible as a side strip the student can summon for
explanation between cards." and mentions `?` as the key to summon the tutor.

The locked `mode-quiz.html` mock and the implemented `QuizTabBody` redesign
intentionally remove the tutor mid-quiz. A mode-rule banner now explains the
policy in-surface.

Update `docs/UX.md` to reflect the current design:
- Remove the "agent visible as side strip" and `?`-key references in the quiz
  section.
- Replace with the one-item-at-a-time layout description: item card center,
  item-status rail right, no tutor mid-quiz, tutor returns after submission.
- Keep the confidence-band description (`1`–`4` rating).

## Context

Found during review of
`epic-ui-redesign-ground-up-chat-workspace-quiz-tab-body` (2026-05-18).
Rolling-foundation rule: foundation docs describe the system as it is NOW.

## Implementation notes

- Replaced the "agent visible as a side strip / `?`-key" description in `docs/UX.md`
  § "quiz (flashcard rhythm)" with an accurate description of the redesigned layout:
  two-column grid (center item card + right item-status rail), mode-rule banner,
  confidence band per item, and final-submit gate before tutor feedback.
- Updated the "Mode-specific differences" bullet in § "Answer submission" to drop
  the `Space`-key reference and describe the "Submit answer" / final submit gate flow.
- ASCII layout diagram redrawn to show the dot-grid rail and next-item ghost.
- No production code changed; docs-only.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: All three required changes landed cleanly. The "side strip / `?`-key" and `Space`-to-advance references are gone; the ASCII diagram reflects the two-column layout with the dot-grid rail; the "Mode-specific differences" answer-submission bullet now describes the Submit-answer / final-submit gate flow. No stale references remain. Foundation-doc drift is resolved. Docs-only change; no tests required.
