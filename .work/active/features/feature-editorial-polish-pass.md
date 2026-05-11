---
id: feature-editorial-polish-pass
kind: feature
stage: drafting
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Editorial polish pass

## Brief

A coordinated sweep that brings four UI surfaces into alignment with the
editorial design system established in Phase 13 (RouteHeader, LibrarySection,
EmptyState, COPY module, `composes: editorial from global;`). Each piece is
small in isolation but they share design-system surface area and are best
designed together so the same theme tokens, scroll affordances, and rendering
rules apply consistently.

**Surface 1 — Header bar light/dark mode alignment.** The header bar should
align with the overall editorial style and pick up light/dark theming. Pattern
check: ensure CSS variables in the design system have light/dark variants and
that the header bar consumes those tokens rather than hardcoded colors. The rest
of the app's editorial style must also render correctly in both modes — this
surface is the canary because it's always visible.

**Surface 2 — Notes table cell rendering.** Notes display in the table currently
doesn't preserve the formatting students expect — markdown (bold, italics,
inline code), bullet lists, and line breaks all collapse or render as raw
characters. The cell renderer should run notes through the same markdown path
used in the chat thread (or a lightweight subset — at minimum line breaks,
inline emphasis, lists) so what students see in the table matches what they
wrote.

**Surface 3 — Concepts list / concept-map navigation and scrolling.** The
concepts view doesn't scroll well and doesn't surface enough at a glance for
large concept sets. The math canonical pack already pushes the limits; the
biology pack will exceed them. Needs a scrollable container with sticky-header
or section grouping for hierarchy, plus a way to filter or jump to a concept
without paging through the full list. Touch the concept map and the flat list
view together.

**Surface 4 — General styling alignment sweep.** Periodic pass — anywhere the
app feels visually inconsistent or hasn't yet picked up the editorial primitives
gets brought into line. Concrete check: every route should be using
`RouteHeader`, every list surface should be using `LibrarySection` or have a
documented reason not to, every empty state should use `EmptyState`, every
copy string should resolve from `COPY` (or have an inline justification for a
literal). Tag-team with Surface 1: the dark-mode work surfaces every place
that hardcoded a color and didn't use a token.

## Scope notes

This is a feature with multiple bounded UI stories rather than an epic — each
surface is a single-session piece of work and the four share enough design-system
context that decomposing into an epic would add ceremony without insight. The
design phase should produce 3-4 child stories (header bar + theme tokens, notes
markdown rendering, concepts navigation + scroll, styling sweep) with explicit
file lists per story.

Dark/light mode and the styling sweep have ordering implications: do the theme
token work first (Surface 1), then the styling sweep can use the new tokens.
Notes rendering and concepts navigation are independent and can run in
parallel.

Origins: `.work/backlog/idea-headerbar-light-dark-mode.md`,
`.work/backlog/idea-notes-table-rendering.md`,
`.work/backlog/idea-concepts-navigation-scrolling.md`,
`.work/backlog/idea-styling-alignment-pass.md`.

<!-- Design and Implementation Notes accumulate here as work progresses. -->
