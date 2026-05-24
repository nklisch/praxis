---
id: feature-concept-maps-top-nav
kind: feature
stage: drafting
tags: [ui, content]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Concept-maps top-nav surface

## Brief

Build the `/concept-maps` top-nav route as a first-class cross-course concept-map
browser, replacing today's placeholder (`packages/ui/src/routes/concept-maps.tsx`
has only a `RouteHeader`). This is the cross-course aggregator — the per-course
list at `/courses/$courseId/concept-maps` already exists via
`concept-maps-list.tsx`.

The locked mock is **Swiss Grid Catalog** — flat sortable 2-col card grid with
per-card coverage micro-bar as the primary signal, filter pills by course at
the top, sort tabs (recent / coverage / course) on the right.

Split from the original `feature-concept-maps-and-progress-routes` aggregator
on 2026-05-23 — the two surfaces had different data sources and different
visual shapes; shipping on independent cadences.

## Mockups

- `/concept-maps` index: `.mockups/screens/feature-concept-maps-and-progress-routes-concept-maps/index.html`
  - **Selected: Option 2 — Swiss Grid Catalog** (2026-05-23)
  - Considered: Editorial TOC (Option 1), Atlas / Visual Index (Option 3),
    Hub + Recent (Option 4) — in `.../option-{1,3,4}.html`.

Mock path retained as-is; this feature inherits it from the original
aggregator.

## Design decisions (inherited from aggregator --only-questions, 2026-05-23)

- **Data model**: extend `client.conceptMaps.list` to accept an optional
  `courseId` plus filter / sort options matching the mock affordances
  (filter by `courseId`, sort by recent / coverage / course). When
  `courseId` is omitted, returns all maps across courses. Server-side
  filtering and ordering — UI does not fan out. The course-scoped variant
  at `/courses/$courseId/concept-maps` continues to work via the same
  method.
- **Canonical-match coverage badge — micro-bar standard.** The locked
  Option 2 mock's per-card micro-bar becomes the canonical coverage
  visualization across all surfaces. Implementation scope includes
  introducing a shared `<CoverageBar>` component in
  `packages/ui/src/components/` and updating `course-detail.tsx` (and any
  other places the legacy affordance appears) to consume it. One source of
  truth.

## Open for feature-design

- Coverage micro-bar component location and exact spec (size, color tokens,
  states).
- Filter/sort URL params on `/concept-maps` for bookmarkability (e.g.
  `?course=algebra&sort=coverage`).
- Empty-state handling: no courses yet, no concept maps yet.
- Whether the cross-course list query is a single DB call with optional
  WHERE or a separate code path; pick what's cleaner in the Drizzle layer.
- IPC channel scope: existing `client.conceptMaps.list` extension vs a
  new method. Recommend extending existing for SSOT.
