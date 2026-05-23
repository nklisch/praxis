---
id: epic-course-create-readiness
kind: epic
stage: implementing
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

## Foundation-doc impact

Reviewed during `epic-design`: `docs/UX.md` already describes a multi-step
course-create flow (the 5-step K-12 onboarding arc Greeting → Material
upload → Course create → Confirmation → First session at lines 88-100, the
"5-step course-create flow" footer card at line 173, and the canvas +
outline body at lines 236-238). The 4-step within-`/course-create` progress
trail proposed in unified-landing (`material · create · confirm · open`) is
at a finer grain than UX.md's 5-step user journey and doesn't contradict
it.

No roll-forward at the epic layer. `feature-design` on unified-landing may
want to add a small clarifying note to UX.md once that feature ships
declaring `/course-create` as the single landing surface for every entry
path — but that's a sentence-level edit, not a structural change.

## Decomposition

Decomposition pre-existed — the 4 child items below were spawned by
`/agile-workflow:scope` during the promotion that created this epic. The
shape was deliberate: split by capability (unified-landing, sidekick-fit,
two bug fixes), not by layer. The bugs sit at the bottom of the dependency
chain because the unified-landing feature's pre-seed-and-start flow assumes
the visible chat surfaces correctly.

### Child items

- `epic-course-create-readiness-startup-invisible` — fix the
  `session.start → tab.open → subscribe` handoff so the chat workspace
  actually connects to the running engine session. **depends on**: `[]`
  *(story, stage: implementing)*
- `epic-course-create-readiness-attach-doc-modal-stuck` — fix the
  modal-dismissal regression in the attach-from-library / inline-upload
  paths and the scopes-refresh gap on the CourseCreate attachments list.
  **depends on**: `[]` *(story, stage: implementing)*
- `epic-course-create-readiness-unified-landing` — unify the course-create
  entry point: single landing surface, pre-seed first message on arrival,
  visible four-step progress trail (`material · create · confirm · open`),
  pack-picker source option alongside upload / paste / from-syllabus.
  **depends on**: `[epic-course-create-readiness-startup-invisible]`
  *(feature, stage: drafting)*
- `epic-course-create-readiness-sidekick-fit` — evaluate sidekick fit in
  course-design mode (hide / swap for draft-state inspector / keep) and
  ship the chosen direction. **depends on**: `[]`
  *(feature, stage: drafting)*

### Decomposition risks

- **Sidekick-fit is question-shaped.** The deliverable depends on
  `feature-design` resolving which of three directions to ship. If the
  answer is "swap for a draft-state inspector," that's a substantial
  build; if it's "hide," it's a single-story patch. Feature-design will
  surface the size at draft time.
- **Unified-landing's pack-picker piece** could expand if the pack
  selection surface needs more than a simple list (search, preview,
  inspection). Watch the scope at feature-design.

## UI alignment deferred

Phase 4.6 (mockup pass) is skipped because Phase 1.5 short-circuited the
decomposition — the children pre-existed from `scope`. Net-new surfaces in
this epic that the design-system principle says should be mocked at the
epic tier (primary):

- **`epic-course-create-readiness-unified-landing`** — the unified landing
  screen, the four-step progress trail, and the multi-screen
  `material · create · confirm · open` flow.
- **`epic-course-create-readiness-sidekick-fit`** — only if the resolved
  direction is "draft-state inspector".

To run the mockup pass at the epic tier, invoke:

```
/agile-workflow:epic-design --only-questions epic-course-create-readiness
```

Otherwise, each feature's own `feature-design` Phase 4.6 will fall back to
mocking on the spot — acceptable, but the epic tier is the principle's
preferred layer for cross-feature visual alignment.

## Source ideas (absorbed)

- `idea-course-create-startup-invisible` → child story
- `idea-course-create-attach-doc-modal-stuck` → child story
- `idea-course-create-unified-landing` → child feature
- `idea-sidekick-view-in-course-design` → child feature (renamed to
  -sidekick-fit to name the deliverable, not the question)
