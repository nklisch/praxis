---
id: epic-editorial-polish-pass-app-chrome
kind: feature
stage: drafting
tags: [ui, editorial]
parent: epic-editorial-polish-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# App chrome refresh — top nav rename, wordmark, editorial alignment

## Brief

The top navigation bar — the static shell mounted once at the router
root above `<Outlet />` — has three inconsistencies with the rest of
the app. The "Chat" nav link is a literal string, semantically wrong
(the tutor surface is not a generic chatbot) and disconnected from the
`epic-tutor-session-feel-tutor-tab-rename` work which moved tab titles
to `Mode.displayName` SSOT. The Praxis wordmark renders in default
text styling instead of the stylised brand treatment used elsewhere.
And the bar overall diverges from the editorial design system
(spacing, typography, border, background) that the rest of the app
adopted in v0.1.1.

This feature renames the "Chat" link to "Tutor," applies the brand
wordmark treatment, and brings the bar into the editorial system —
RouteHeader-style typography, consistent border/background tokens,
proper brand mark. Bounded to `nav.tsx` and the editorial primitives
it should compose with.

## Epic context

- Parent epic: `epic-editorial-polish-pass`
- Position in epic: independent — different surface from the other
  three features. Runs in parallel.

## Scope absorbed from backlog

- `idea-top-menu-bar-styling` — three issues in one (rename, brand
  mark, editorial alignment).

## Foundation references

- `docs/UX.md` — editorial design tokens / system
- `CLAUDE.md` — pattern `editorial-ui-primitives`

## Anchors (current implementation)

- Top nav — `packages/ui/src/components/nav.tsx` (static; "Chat" is a
  literal string in the `<Link>` at line ~56; not dynamic against the
  active route)
- Nav mount point — `packages/ui/src/router.tsx:42`
- Editorial primitives — `packages/ui/src/components/editorial/`
  (RouteHeader and the `composes: editorial from global;` CSS module
  utility)
- Wordmark / brand mark — search for "Praxis" wordmark component or
  SVG asset in `packages/ui/src/components/` and `packages/ui/public/`
- Prior tab-rename work for reference — `Mode.displayName` SSOT
  introduced in `epic-tutor-session-feel-tutor-tab-rename`. Top nav
  rename is a separate surface from the tab strip; this feature only
  changes the route-link label, not the tab title flow.

## Pre-design decisions (2026-05-14)

- **None surfaced at scope-ambiguity sweep.** The rename target is
  "Tutor" per the original idea body. The wordmark treatment and
  editorial alignment are visual decisions that feature-design picks
  alongside the editorial-primitives reference. No design forks that
  require pre-decision now.
