---
id: feature-editorial-polish-pass-concepts-navigation
kind: story
stage: implementing
tags: [ui]
parent: feature-editorial-polish-pass
depends_on: [feature-editorial-polish-pass-theme-tokens]
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Concepts list: scrollable + filter + sticky section headers

## Scope

Story 3 of `feature-editorial-polish-pass`. The flat-list concepts route
doesn't scroll well and doesn't surface enough at a glance for large concept
sets (math pack pushes limits; biology pack will exceed them). Add:

1. Scrollable container with constrained `max-height`.
2. Section grouping by parent unit with sticky `<h3>` headers.
3. Text filter input above the list — case-insensitive substring match;
   clears with Escape or a small clear button.

Concept-map (graph view) scrolling is OUT of scope — React Flow owns that
interaction. Only the flat list view is touched.

## Files to touch

The implementer should locate the flat-list concepts route file (likely under
`packages/ui/src/routes/concepts.tsx` or `packages/ui/src/routes/course/*.tsx`
— confirm via grep). Plus its CSS module.

- The concepts route file — add scroll container, filter input, section grouping.
- Its `.module.css` — `overflow-y: auto`; `position: sticky; top: 0` on `<h3>` group headers.
- A test file (extend or new) — assert filter narrows the visible list and Escape clears the filter.

## Acceptance criteria

- [ ] Concept list scrolls cleanly when the count exceeds the viewport height.
- [ ] Concept groups have sticky `<h3>` headers that stay visible as the user scrolls within a group; groups are by parent-unit title, with fallback "Ungrouped" for concepts without a parent unit.
- [ ] Filter input narrows the visible list as the user types; case-insensitive substring match against concept name.
- [ ] Escape clears the filter input and restores the full list.
- [ ] A clear button (visible only when input is non-empty) does the same.
- [ ] No regression: existing concept click / select behaviors continue to work.

## Implementation notes

- Sub-1000-concept scale: CSS-only sticky-header approach handles it. No virtualization.
- Filter behavior: case-insensitive substring against concept name. Include the description in the search if there's space, otherwise just name.
- Filter input styling: use existing editorial primitives if a search/filter input exists in the codebase; otherwise a minimal styled `<input>` consistent with the design system.

## References

- Design: `.work/active/features/feature-editorial-polish-pass.md` (Story 3)
- Editorial primitives: `RouteHeader`, `LibrarySection`, `EmptyState` patterns.

<!-- Implementation Notes accumulate here as work progresses. -->
