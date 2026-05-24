---
id: feature-concept-maps-and-progress-routes
kind: feature
stage: done
tags: [ui, content]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Concept-maps and progress top-nav routes

## Brief

The top-nav `/concept-maps` and `/progress` routes are stubs:

- `packages/ui/src/routes/concept-maps.tsx` — `RouteHeader` only; comment
  says "Full implementation follows in the concept-maps surface story."
- `packages/ui/src/routes/progress.tsx` — `RouteHeader` only; "Placeholder
  registered so the top-nav Progress link resolves as a valid typed
  route."

Build out the actual surfaces as first-class top-nav destinations:

- **Concept-maps browser / index.** List all maps across courses, open
  the editor on click, surface canonical-match coverage so the author
  sees which concepts are mapped and which aren't. (The
  course-scoped list at `/courses/$courseId/concept-maps` already exists
  via `concept-maps-list.tsx` — this is the cross-course aggregator.)
- **Progress surface.** Student-facing mastery / grade summary, gate
  state, recent activity — the at-a-glance view of where the student
  stands across their courses.

## Mockup status (2026-05-23 — corrected from original)

**No existing mocks apply to these surfaces.** The earlier reference to
`.mockups/screens/epic-ui-redesign-ground-up-discovery-surfaces/` was
wrong: those 4 options were for the **Library redesign** (which shipped
in v0.1.3 as the Workbench shape — `library.tsx`), not for /concept-maps
or /progress. The discovery-surfaces feature explicitly notes "Concept
maps index" as a list view onto course concept maps — but the chosen
Option 4 (Workbench) only added small footer cards linking to /concept-maps
and /documents, never mocking the destinations themselves.

**Decision (epic-design --only-questions, 2026-05-23):** generate fresh
mocks via `/ux-ui-design:screens` — 4 options each for /concept-maps
top-nav surface and /progress top-nav surface, picked separately.

## Mockups

- `/concept-maps` index: `.mockups/screens/feature-concept-maps-and-progress-routes-concept-maps/index.html`
  - **Selected: Option 2 — Swiss Grid Catalog** (2026-05-23)
  - Flat sortable 2-col card grid. Per-card coverage micro-bar as a
    primary signal at every map. Filter pills by course (All / Algebra /
    Biology / Calculus / History) at the top; sort tabs (recent /
    coverage / course) on the right. Dense, scannable, catalog-like.
    Coverage surfaces per-map rather than per-course.
  - Considered: Editorial TOC (course-as-issue, per-course coverage in
    the right margin), Atlas / Visual Index (thumbnail-first grid showing
    map shape), Hub + Recent (sparse action-forward with resume hero)
    — in `.../option-{1,3,4}.html`.
- `/progress` surface: `.mockups/screens/feature-concept-maps-and-progress-routes-progress/index.html`
  - **Selected: Option 1 — Course-by-Course Review** (2026-05-23)
  - Each course is a chapter with three sections in a three-column body:
    you-are-here (narrative + next gate), stuck-on (3-4 concepts with
    mastery scores), recently (3 events — sessions / gates / grades).
    Per-course rollup at the head (mastery percent + micro-bar). Long
    single column; scales naturally from 1 course to many. Course-health
    is the primary signal; concept and event data hang underneath.
  - Considered: Mastery Heatmap (concept-cell grid with monochrome
    plaster→graphite mastery scale, brick accent for at-risk), Timeline /
    Week-in-Review (chronological event feed + sticky digest sidebar),
    Three-Pane Digest (sparse Strong / Stuck / Recent shortlists)
    — in `.../option-{2,3,4}.html`.

## Design decisions (feature-design --only-questions, 2026-05-23)

- **Substrate shape: split into two features.** Different data
  dependencies (cross-course conceptMap aggregator vs progress rollup),
  different visual shapes (Swiss grid catalog vs course-by-course
  review), can ship on independent cadences. Next pass should:
  1. Spawn `feature-concept-maps-top-nav` (drafting) carrying the
     Selected-Option-2 Swiss Grid Catalog mock + the conceptMaps data
     decisions below.
  2. Spawn `feature-progress-top-nav` (drafting) carrying the
     Selected-Option-1 Course-by-Course Review mock + the
     ProgressService decisions below.
  3. Archive this aggregator feature to `.work/archive/` as
     superseded-by-split, with closure note pointing at both.
  Mockup paths stay where they are; the two new features reference
  them.
- **Concept-maps cross-course list — data model: extend
  `client.conceptMaps.list` to accept an optional `courseId`.** When
  `courseId` is omitted, return all maps across courses. The IPC
  channel also gains filter / sort options matching the mock affordances
  (filter by courseId, sort by recent / coverage / course). Server-side
  filtering and ordering — UI doesn't fan out. Course-scoped variant at
  `/courses/$courseId/concept-maps` continues to work via the same
  method.
- **Progress surface — data sourcing: new `ProgressService` aggregator
  on the backend.** Single IPC method returns the full /progress
  payload: per-course rollup (mastery percent + bar), per-course
  "you-are-here" (current lesson + next gate), per-course "stuck on"
  (3-4 concepts with mastery), per-course "recently" (3 events:
  sessions / gates / grades). Server performs the joins. Mirrors the
  `RecommendationService` pattern from the Workbench.
- **Canonical-match coverage badge — unify the visualization across
  surfaces.** Take this as a chance to lock one canonical coverage
  visualization. The micro-bar pattern from the locked /concept-maps
  Option 2 mock becomes the standard; update course-detail's
  concept-coverage affordance to match. Implementation scope includes
  touching course-detail.tsx (and any other places the legacy
  affordance appears). Cleaner design-system result; one source of
  truth.

## Open for feature-design (per new feature, after split)

- Progress surface scope is single-student v1 per VISION.md. Don't
  build the multi-student shell pre-emptively.
- ProgressService payload shape — Drizzle query strategy (recursive CTE
  vs N+1 vs hybrid). Per-course rollup is hot path; profile early.
- Coverage micro-bar component location — `packages/ui/src/components/`
  with `coverage-bar.tsx` + module CSS. Used by both the new top-nav
  and the updated course-detail.
- Filter/sort URL params on /concept-maps for bookmarkability.
- Empty-state handling for both surfaces (no courses yet, no maps yet,
  no progress data yet).

## Closure (feature-design, 2026-05-23, autopilot)

Superseded by split per the locked `--only-questions` decision. Spawned
two child features carrying the decisions and mockups forward:

- `feature-concept-maps-top-nav` (drafting) — `/concept-maps` cross-course
  Swiss Grid Catalog surface
- `feature-progress-top-nav` (drafting) — `/progress` Course-by-Course
  Review surface

Both new features inherit the locked mockup paths and the design decisions
captured here (data model extensions, canonical CoverageBar). Archiving
this aggregator as no-longer-the-unit-of-work; further design happens on
the two children.
