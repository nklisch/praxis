---
id: epic-course-create-readiness
kind: epic
stage: drafting
tags: [ui, tutor-ux, bootstrap, course-authoring]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Course-create readiness

## Brief

Course-create (course-design mode) is the authoring path that turns source
material into a course, but several rough edges have surfaced since the UI
redesign and the bootstrap-readiness work. Some are pure bugs (the visible
chat doesn't connect to the underlying session on startup; a modal stacks on
top of the previous one in the attach-doc flow and the attachments list
doesn't refresh after attach). Others are UX gaps left over from prior
phases (no unified landing — some paths drop the user straight into a fresh
chat, there's no pack-picker surface, no visible four-step progress trail,
and the prompt typed at the landing isn't pre-seeded as the first message).
A separate open question is whether the sidekick panel that fits study modes
also fits course-design, where the dominant surface is the units / lessons
/ assessment-plan artifact rather than tutor scratchwork.

This epic is the coherent "make course-create feel finished and trustworthy"
arc that closes those edges together. It bundles two bug-shaped stories
(startup-invisible, attach-doc-modal-stuck), one substantive UX feature
(unified-landing with pre-seed, progress trail, and pack picker), and one
design-exploration feature (sidekick fit). The bugs land first because the
unified-landing feature depends on the startup-handoff actually surfacing
the chat — without that fix, "pre-seed and start the conversation in one
click" can't work.

No foundation-doc roll-forward at scope. `epic-design` will decide whether
`docs/UX.md` needs a roll-forward to reflect the unified-landing entry-point
story when it decomposes this epic.

## Children (decomposition pending epic-design)

- `epic-course-create-readiness-startup-invisible` (story, bug) — fix the
  session.start → tab.open → subscribe handoff so the chat workspace
  actually connects to the running engine session.
- `epic-course-create-readiness-attach-doc-modal-stuck` (story, bug) —
  fix the modal-dismissal regression in the attach-from-library /
  inline-upload paths and the scopes-refresh gap on the CourseCreate
  attachments list.
- `epic-course-create-readiness-unified-landing` (feature) — unify the
  course-create entry point: single landing surface, pre-seed first
  message on arrival, visible four-step progress trail
  (`material · create · confirm · open`), and a pack-picker source option
  alongside upload / paste / from-syllabus. **Depends on
  `epic-course-create-readiness-startup-invisible`** because the
  pre-seed-and-start flow assumes the visible chat actually appears.
- `epic-course-create-readiness-sidekick-fit` (feature) — evaluate
  sidekick fit in course-design mode (hide / swap for draft-state
  inspector / keep) and ship the chosen direction.

## Source ideas (absorbed)

- `idea-course-create-startup-invisible` → child story
- `idea-course-create-attach-doc-modal-stuck` → child story
- `idea-course-create-unified-landing` → child feature
- `idea-sidekick-view-in-course-design` → child feature (renamed to
  -sidekick-fit to name the deliverable, not the question)
