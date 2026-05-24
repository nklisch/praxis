---
id: feature-orphan-routes-audit
kind: feature
stage: drafting
tags: [ui, cleanup, navigation]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Audit orphan routes vs reachable navigation

## Brief
The router (`packages/ui/src/router.tsx`) defines ~18 routes, but the top-nav surfaces
only 5 destinations (`/`, `/workspace`, `/concept-maps`, `/progress`, `/configure`).
Several routes — `/settings`, `/courses` redirect, `/packs` redirect, course detail /
map / concepts pages, the workspace note editor, etc. — may be registered but
unreachable from any UI link or CTA, or reachable only by deep-link / URL bar.

Surfaced during `/agile-workflow:feature-design --only-questions` on
`epic-course-create-readiness-unified-landing` (2026-05-23) — adjacent to the `/packs`
disposition decision.

## Goals
- **Inventory** every route registered in the router and map it to inbound navigation
  affordances (`<Link>` / `navigate(...)` / programmatic redirects).
- **Classify** each route:
  - Reachable from top-nav or a documented entry point → keep, no action
  - Reachable only via contextual link (e.g. from a card or detail page) → keep,
    document the entry point
  - Reachable only via deep-link (URL bar) → decide: promote to a nav surface,
    keep as URL-bar-only with a clear use case, or remove
  - Registered but unreachable from any link or CTA → remove the route, or restore
    its entry point if it should be reachable
- **Produce outcomes**: per finding, either fix-stories (add inbound links, remove
  dead routes, promote to nav) or a roll-up if the pattern is more systematic.

## Out of scope
- Redesigning the top-nav (separate concern)
- Per-route content / layout changes (just navigation reachability)
- Search affordances (a finding may *suggest* search, but search itself is a separate
  feature)

## Approach
The feature-design pass will define:
- Inventory method (one Explore agent over `router.tsx` + a grep sweep for `<Link>`
  / `navigate(`)
- Classification rubric
- Outcome shape (fix stories vs roll-up)

## Next
Per-feature design via `/agile-workflow:feature-design feature-orphan-routes-audit`
to nail down the inventory method, classification rubric, and child-story decomposition.
