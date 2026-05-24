---
id: epic-course-create-readiness
kind: epic
stage: done
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

### Decomposition risks (resolved during --only-questions, 2026-05-23)

- **Sidekick-fit question-shape — resolved.** Direction locked: hide
  the right rail in course-create. Confirmed problem: `chat.tsx` always
  renders `ChatRightPanel` (Concepts + Sidekick-placeholder) and
  course-create's tab body renders its own `AuthoringChatPane` —
  two right panels compete. Story-sized fix in chat.tsx. See
  `epic-course-create-readiness-sidekick-fit` body for the locked
  decision and implementation shape.
- **Unified-landing pack-picker — sized down.** Validation against
  `packages/ui/src/routes/course-create.tsx` showed the route already
  has the hero, drop zone, attached files, context textarea, pre-seed
  wiring, and the 4-step stepper. Feature reduces to three concrete
  pieces: reroute 5 bypass entry points, embed pack picker as a
  source option, rename stepper Step 2 (`Explore` → `Create`) with
  the code/doc alignment audit. See
  `epic-course-create-readiness-unified-landing` body for the
  re-scope.

## Design decisions (--only-questions, 2026-05-23)

- **Sidekick-fit direction: hide.** Captured in
  `epic-course-create-readiness-sidekick-fit`. May collapse to a
  single story at feature-design time.
- **Unified-landing stepper Step 2: rename `Explore` → `Create`.**
  Plus code+doc alignment audit per user instruction (find: 1 UI
  label, 1 frozen phase-design doc, 0 semantic verb usages to
  change). Captured in
  `epic-course-create-readiness-unified-landing`.
- **Unified-landing pack-picker placement: inside `/course-create`.**
  Pack picker becomes a source option alongside file upload. Open
  sub-decision deferred to feature-design: does `/packs` collapse
  into the Library tab (user's lean) or stay standalone?
- **Sketch → concept-map promotion: closed as already shipped.**
  Validation revealed the CTA is live in `note-editor-sketch.tsx`
  with full modal and test coverage. The sibling top-level feature
  `feature-sketch-to-concept-map-promotion` is archived. Not part of
  this epic, but logged here because it was identified in the same
  validation pass.

## UI alignment status

Phase 4.6 mockup pass: 1 of 2 net-new surfaces require new mocks:

- **`epic-course-create-readiness-unified-landing`** — pack source
  option inside the landing's source-selector area; optional "Resume
  draft" affordance if any resume paths route through the landing.
  The existing `.mockups/flows/course-create-entry/` covers the
  post-landing experience.
- **`epic-course-create-readiness-sidekick-fit`** — no mock needed.
  Direction is "hide"; no new surface to design.

Mocks queued for `feature-design` on unified-landing.

## Source ideas (absorbed)

- `idea-course-create-startup-invisible` → child story
- `idea-course-create-attach-doc-modal-stuck` → child story
- `idea-course-create-unified-landing` → child feature
- `idea-sidekick-view-in-course-design` → child feature (renamed to
  -sidekick-fit to name the deliverable, not the question)

## Children complete + Review (2026-05-23, epic-level)

**Verdict**: Approve (epic-level review per the review skill — per-line
lenses exercised on each child individually; epic scope focuses on
capability completeness, foundation alignment, cross-cutting concerns).

All 5 substantive children resolved:

- `epic-course-create-readiness-startup-invisible` (story) — **done**.
  Fixed two bugs in `openSessionInTab`: `client.tabs.open` was bypassing
  TabsProvider state; `initialMessage` was sent fire-and-forget before
  the tab body mounted. New `openTab` arg + `consumeInitialMessage`
  module-level map. Commit `700a0b5`.
- `epic-course-create-readiness-attach-doc-modal-stuck` (story) —
  **done**. Bug 1: gated the picker `<Modal>` on `ingestion.state.status
  !== "batch_summary"` to prevent two-dialog stacking. Bug 2: added
  `useResource(attachedLoader)` to CourseCreateTabBody so attached
  documents render on the canvas; wired `onAttached` callback for
  refresh. Commit `d9fca8b`.
- `epic-course-create-readiness-sidekick-fit` (feature) — **archived**
  (collapsed to single story per locked decision).
- `epic-course-create-readiness-sidekick-fit-hide` (story, replacement
  for the collapsed feature) — **done**. Suppressed `ChatRightPanel`
  when active tab is `course-create` mode. Layout collapses cleanly to
  2 columns. Commit `b9e3c9e`.
- `epic-course-create-readiness-unified-landing` (feature) — **done**
  (4 child stories all done, all approved). `/course-create` is now
  the single canonical landing for cold-start course-authoring entries;
  3-tab source picker (Pack / Upload / Paste); `?pack=<id>` URL
  contract; /packs folded into Library section; onboarding slimmed;
  stepper reads `Material · Create · Confirm · Open`. Commits
  `aa5adfb`, `a8b8b53`, `f4a5c25`, `62f983b`, `2b9ff76`, `4c8b642`.

**Capability completeness check**: the brief's "make course-create feel
finished and trustworthy" arc is delivered end-to-end. The startup
handoff surfaces correctly (startup-invisible), the attach flow no
longer stacks or hides documents (attach-doc-modal-stuck), the
right-rail crowding is resolved (sidekick-fit-hide), the entry surface
is unified with pack-picker source option and aligned naming
(unified-landing).

**Foundation-doc alignment check**: no `docs/` assertions invalidated.
`docs/UX.md` 5-step K-12 onboarding arc and the 4-step within-/course-create
stepper continue to describe the system as it ships (after the
Explore → Create rename, which is internal to the 4-step micro-stepper).
The phase-16 doc rename was deferred per rolling-foundation convention.
The `tabs.sessionId` FK was removed (migration 0026, via feature-empty-
session-cleanup which is now archived), but no foundation doc asserted
that FK.

**Breaking changes check**: `/packs` URL now redirects to `/library`
(zero inbound links to update; external bookmarks survive via redirect).
`openSessionInTab` signature gained a required `openTab` argument
(internal API; all 5+ call sites updated). `SessionService.start`
signature gained an internal `_persistImmediately` flag (not exposed
via IPC).

**Side-effect features absorbed**: the empty-session-cleanup feature
(feature-empty-session-cleanup, archived) shipped alongside via the
same autopilot run — net wins for the project beyond this epic's stated
scope.

**Notes**: Epic has no release_binding — archiving on completion.
