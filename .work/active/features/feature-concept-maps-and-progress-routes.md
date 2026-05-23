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

The top-nav `/concept-maps` and `/progress` routes are currently
placeholder stubs (RouteHeader + nothing else) — full implementations
were deferred during the UI redesign. Mocks for both surfaces already
exist in `.mockups/screens/epic-ui-redesign-ground-up-discovery-surfaces/`
and describe the intended shape.

Build out the actual surfaces:

- **Concept-maps browser / index.** List all maps across courses, open
  the editor on click, surface canonical-match coverage so the author
  sees which concepts are mapped and which aren't.
- **Progress surface.** Student-facing mastery / grade summary, gate
  state, recent activity — the at-a-glance view of where the student
  stands across their courses.

Today these features are only reachable indirectly through course detail
routes — promoting them to first-class top-nav destinations closes the
discovery gap the redesign opened.

## Mockups

Existing: `.mockups/screens/epic-ui-redesign-ground-up-discovery-surfaces/`
(from the redesign epic). `feature-design` confirms the existing mocks are
still the intended shape or proposes refinements.
