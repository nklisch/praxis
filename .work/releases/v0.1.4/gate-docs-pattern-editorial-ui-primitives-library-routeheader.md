---
id: gate-docs-pattern-editorial-ui-primitives-library-routeheader
kind: story
stage: done
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: docs
created: 2026-05-23
updated: 2026-05-24
---

# Pattern skill `editorial-ui-primitives` `<RouteHeader>` example for `library.tsx:97` no longer exists

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/editorial-ui-primitives.md:35-41`
- Code: `packages/ui/src/routes/library.tsx` (no `RouteHeader` usage)

## Current doc text
> ```tsx
> // packages/ui/src/routes/library.tsx:97
> <RouteHeader
>   ornament="⁂"
>   kicker="LIBRARY"
>   title="your library"
>   deck="what you have to work with"
> />
> ```

## Reality
`library.tsx` (the Workbench rebuild) does not import or render
`<RouteHeader>` at all. The Workbench layout is a greeting + columns +
footer cards composition, not a route-header surface. Bundle commit
`c7638a1` (story-multi-document-upload) added the `AddDocumentButton`
inside the Documents footer card.

## Required edit
Replace the `library.tsx:97` example with a current `RouteHeader` call
site (e.g. `packages/ui/src/routes/courses.tsx:53` or
`packages/ui/src/routes/concept-maps-list.tsx:65`). Keep the
`courses.tsx` example below, but update its line number from `:28` to
the current line in `courses.tsx`.

## Implementation notes
Replaced the stale `library.tsx:97` example (and the outdated `courses.tsx:28` citation) with the live `<RouteHeader>` call at `packages/ui/src/routes/courses.tsx:53`, which uses `route-meta.ts`-sourced props and an `actions` slot — a representative real-world usage. `library.tsx` no longer renders `<RouteHeader>` (Workbench layout), so it was dropped entirely from the doc.

## Review
Verdict: **done**. Cross-checked `packages/ui/src/routes/courses.tsx:53` — the `<RouteHeader>` call in the pattern skill exactly matches the live source (ornament/kicker/title/deck from `meta`, `actions` slot with `<ResumeDraftPicker>` + `+ New course` button). The stale `library.tsx:97` and `courses.tsx:28` references are fully replaced. No issues found.
