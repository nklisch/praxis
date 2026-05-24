---
id: feature-progress-top-nav
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

# Progress top-nav surface

## Brief

Build the `/progress` top-nav route as a first-class student-facing summary,
replacing today's placeholder (`packages/ui/src/routes/progress.tsx` has only
a `RouteHeader`). Single-student v1 per `docs/VISION.md` — do not build the
multi-student shell pre-emptively.

The locked mock is **Course-by-Course Review** — each course is a chapter
with three sections in a three-column body: you-are-here (narrative + next
gate), stuck-on (3-4 concepts with mastery scores), recently (3 events:
sessions / gates / grades). Per-course rollup at the head (mastery percent +
micro-bar). Long single column; scales naturally from 1 course to many.

Split from the original `feature-concept-maps-and-progress-routes` aggregator
on 2026-05-23.

## Mockups

- `/progress` surface: `.mockups/screens/feature-concept-maps-and-progress-routes-progress/index.html`
  - **Selected: Option 1 — Course-by-Course Review** (2026-05-23)
  - Considered: Mastery Heatmap (Option 2), Timeline / Week-in-Review
    (Option 3), Three-Pane Digest (Option 4) — in `.../option-{2,3,4}.html`.

Mock path retained as-is; this feature inherits it from the original
aggregator.

## Design decisions (inherited from aggregator --only-questions, 2026-05-23)

- **Data sourcing**: new `ProgressService` aggregator on the backend. A
  single IPC method returns the full `/progress` payload — per-course
  rollup (mastery percent + bar), per-course "you-are-here" (current
  lesson + next gate), per-course "stuck on" (3-4 concepts with mastery),
  per-course "recently" (3 events: sessions / gates / grades). Server
  performs all joins. Mirrors the `RecommendationService` pattern from the
  Workbench.
- **Canonical-match coverage badge — micro-bar standard.** Same shared
  `<CoverageBar>` component as `feature-concept-maps-top-nav` if any
  per-course mastery bar uses the same shape. Both features benefit from
  one source of truth.

## Open for feature-design

- ProgressService payload shape — Drizzle query strategy (recursive CTE
  vs N+1 vs hybrid). Per-course rollup is hot path; profile early.
- Caching strategy for the payload (per-session? per-turn? always live?).
- Empty-state handling: no courses yet, no progress data yet.
- "Stuck on" concept selection algorithm — bottom-N by mastery? lowest
  movers? mix? Resolve at design time, document in the design body.
- "Recently" event scope and ordering — by recency only, or weighted by
  significance (gate clears vs routine sessions).
