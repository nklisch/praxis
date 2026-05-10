---
id: epic-phase-19-first-run-flow
kind: feature
stage: drafting
tags: [ui, content]
parent: epic-phase-19-ship-v1
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# First-run flow

## Brief

Deliver the v1 first-run user-facing flow: install → sign in / configure
engine → bootstrap a course → start a teach session. Today, opening the
app on a fresh install drops the user into the existing UI shell with no
guided setup; auth and engine config exist as deep settings surfaces but
aren't surfaced as "the next step" for someone who just opened the app
for the first time. ROADMAP calls this out as the v1 acceptance flow and
the test-checkpoint script.

What this feature covers:

- A first-run detection signal in the main process (e.g., `config_kv`
  flag `firstRunCompletedAt`) that gates a renderer route shown only
  when unset.
- A welcome flow with progressive steps: brand intro → engine choice +
  sign-in / API key entry → optional pack-or-bootstrap fork ("start with
  the canonical Algebra pack" / "start with biology" / "start from your
  own syllabus") → land in a teach session of the chosen path.
- Reuses existing services: `BootstrapServiceImpl.createCourseFromPack`
  for the canonical-pack path, `course.start_exploration` for the
  syllabus-driven path. The first-run UI is a wrapper around the
  existing flows, not a parallel implementation.
- Editorial primitives — `RouteHeader`, `EmptyState`, `LoadingState`,
  COPY module — used per the editorial design system in
  `packages/ui/src/`.
- A "skip onboarding" path for power users so the flow is not a wall.

What this feature does NOT cover:

- Authoring of pedagogy or pack content — those live in their own
  features.
- Re-onboarding for existing users — first-run is detected once and
  stays detected.
- A separate "tour" overlay over the main UI — the flow lands in real
  state, not a tutorial.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: independent capability. Does not block other
  features; ship-checklist exercises it end-to-end at the close. The
  onboarding-docs feature reads this flow as ground truth for the
  README rewrite.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 build list ("Installer flow + first-run
  onboarding") and test checkpoint.
- `docs/UX.md` — editorial design system shape and copy tone.
- `docs/ARCHITECTURE.md` — service composition for the IPC channels the
  flow will call.
- `packages/ui/src/` — RouteHeader, LibrarySection, EmptyState, COPY
  module conventions; `composes: editorial from global;` CSS pattern.
- `packages/curriculum/src/bootstrap/` — bootstrap service the flow
  delegates to.
- `packages/core/src/services/` and `packages/core/src/db/` — `config_kv`
  pattern for the first-run flag.

<!-- Feature-design pass will spec the route, the step UI shape, the
config flag's read/write surface, and the test approach. -->
