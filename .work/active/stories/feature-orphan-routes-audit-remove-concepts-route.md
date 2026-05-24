---
id: feature-orphan-routes-audit-remove-concepts-route
kind: story
stage: implementing
tags: [ui, navigation, cleanup]
parent: feature-orphan-routes-audit
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Remove or link /courses/$courseId/concepts

## Location
`packages/ui/src/router.tsx` (line 134–138)
`packages/ui/src/routes/course-concepts-list.tsx`

## Evidence
`/courses/$courseId/concepts` (CourseConceptsListRoute) is registered in the router but has **no inbound navigation from anywhere in the codebase** — not from `course-detail.tsx`, not from `course-map.tsx`, not from any other route or component. It is a complete orphan reachable only by typing the URL directly.

Grep result: the path `/courses/$courseId/concepts` appears only in `router.tsx` (the registration), the route file's own imports, and `route-meta.ts` (the `courseConcepts` entry).

The route renders a filterable flat-list of concepts grouped by lesson. This is potentially useful functionality (a quick "what concepts does this course have?" view), but it is currently undiscoverable.

## Decision point
Two options:

**A) Link it**: add a "View concepts" link from `CourseDetailRoute` next to the existing "View progress map" button. This surfaces the flat-list as a complement to the graph-based map.

**B) Remove it**: delete `courseConceptsListRoute` from `router.tsx`, delete or archive `course-concepts-list.tsx`, and remove `courseConcepts` from `route-meta.ts`. Use the map view (`/courses/$courseId/map`) as the sole concept-navigation surface.

## Recommendation
Option A — link it. The flat-list is a useful accessibility complement to the graph map, and the component is already fully implemented. A single "All concepts" button in `CourseDetailRoute`'s actions section is sufficient.

## Acceptance (option A)
- `CourseDetailRoute` renders a link/button → `/courses/$courseId/concepts`.
- Navigating to the route renders the concepts list.
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance (option B)
- `courseConceptsListRoute` removed from `router.tsx`.
- `course-concepts-list.tsx` deleted.
- `courseConcepts` entry removed from `ROUTE_META`.
- No broken imports remain.
- `pnpm typecheck && pnpm lint && pnpm test` green.
