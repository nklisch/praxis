---
id: feature-concept-maps-and-progress-routes
kind: feature
stage: drafting
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
- `/progress` surface: mockups pending (next /ux-ui-design:screens pass).

## Design questions for feature-design

- Data model for "list all maps across courses" — does
  `client.conceptMaps.list` accept a no-courseId variant, or do we
  aggregate across `client.courses.list` calls in the UI?
- Progress surface scope: single-student view only (v1) or
  multi-student-ready shell? Vision says single-student in v1; lean
  single-student.
- Canonical-match coverage badge — same surface treatment as the
  course-detail "concept coverage" affordance, or distinct?
