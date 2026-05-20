---
id: idea-build-out-concept-maps-progress-surfaces
created: 2026-05-19
tags: []
---

The top-nav `/concept-maps` and `/progress` routes are currently
placeholder stubs (RouteHeader + nothing else) — full implementations
were deferred during the UI redesign. Mocks for both surfaces already
exist in `.mockups/screens/epic-ui-redesign-ground-up-discovery-surfaces/`
and describe the intended shape. Build out the actual surfaces: the
concept-maps browser/index (list all maps across courses, open the
editor, surface canonical-match coverage), and the progress surface
(student-facing mastery/grade summary, gate state, recent activity).
Today these features are only reachable indirectly through course detail
routes — promoting them to first-class top-nav destinations closes the
discovery gap the redesign opened.
