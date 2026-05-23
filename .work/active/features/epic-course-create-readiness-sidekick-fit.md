---
id: epic-course-create-readiness-sidekick-fit
kind: feature
stage: drafting
tags: [ui, tutor-ux, course-authoring]
parent: epic-course-create-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-20
updated: 2026-05-23
---

# Sidekick fit in course-design

## Brief

The sidekick view (the per-mode right-hand panel surfacing tutor
scratchwork and live artifacts) may not fit course-design mode the way it
does in study modes. The authoring flow has its own dominant surface — the
units / lessons / assessment-plan artifact being drafted — and the sidekick
might be redundant or actively confusing here.

`feature-design` resolves the direction and ships it. Three plausible
outcomes:

1. **Hide.** Course-design mode suppresses the sidekick panel; the chat is
   the only surface alongside the draft artifact.
2. **Swap for a draft-state inspector.** Replace the generic sidekick with
   a course-design-specific panel surfacing live draft state (units added,
   lessons pending, assessment plan progress, validation gaps).
3. **Keep as-is.** Confirm the existing sidekick payload is useful here
   and document why.

The slug names the deliverable (a decision on the fit) rather than the
question — the feature ships whichever of the three the design pass picks.

## Mockups

If the resolved direction is option 2 (draft-state inspector), mock the
inspector at `.mockups/screens/epic-course-create-readiness-sidekick-fit/`.
Options 1 and 3 may not need a mock — the design pass decides.
