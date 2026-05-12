---
id: feature-editorial-polish-pass-concepts-navigation
kind: story
stage: done
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

## Implementation notes

### Discovery: no flat-list concepts route existed

No `packages/ui/src/routes/concepts.tsx` or related file existed. The
codebase had a concept-map graph editor (`concept-map-editor.tsx`, uses
tldraw), a list of concept-maps (`concept-maps-list.tsx`), and a
progress map graph (`course-map.tsx`, uses React Flow). None was a flat
list of course concepts. Per the escape-hatch instruction in the
implementation brief, option (a) was taken: a new flat-list route was
created at `/courses/$courseId/concepts`.

### Files touched

| File | Action |
|---|---|
| `packages/ui/src/routes/course-concepts-list.tsx` | **new** — the flat-list route component |
| `packages/ui/src/routes/course-concepts-list.module.css` | **new** — CSS module with scroll, sticky headers, filter styles |
| `packages/ui/src/__tests__/course-concepts-list-route.test.tsx` | **new** — 10 test cases |
| `packages/ui/src/router.tsx` | added `courseConceptsListRoute` at `/courses/$courseId/concepts` |
| `packages/ui/src/components/route-meta.ts` | added `courseConcepts` meta entry |
| `packages/ui/src/lib/copy.ts` | added `COPY.empty.concepts` string |

### Grouping strategy

The `concepts()` API returns a flat list with no `unitId` field. Units
are a bootstrap-service concept not currently exposed through the
artifacts client. The next-available curriculum hierarchy is the
**lesson**: each lesson has an ordered `conceptIds` array. Groups are
keyed by `lesson.title` and ordered by `lessons()` order. Concepts not
in any lesson fall into an "Ungrouped" section at the end. This matches
the story's intent (parent-unit title → lesson title is the available
proxy; "Ungrouped" fallback preserved).

### Filter UX

- `<input type="search">` with `placeholder="filter concepts…"`.
- Case-insensitive substring match against `name` and `description`.
- Escape key clears value and blurs the input.
- `×` clear button appears at right when value is non-empty; clicking
  clears and re-focuses the input.
- Browser's native search-cancel button suppressed via
  `::-webkit-search-cancel-button { display: none }` to avoid double
  clear controls.

### Scroll + sticky headers

- `.scrollContainer` has `overflow-y: auto; flex: 1` — fills remaining
  height in the flex column without a fixed pixel max-height (adapts to
  the viewport naturally).
- `.groupHeader` uses `position: sticky; top: 0; z-index: 1;
  background: var(--color-bg)` — stays pinned at the top of the scroll
  container as the user scrolls through a long group.
- No virtualization needed for sub-1000-concept counts.

### Test cases (10)

1. Empty state renders when no concepts exist.
2. Concept names render grouped by lesson title.
3. Concepts with no lesson appear in "Ungrouped".
4. Filter input narrows the list (case-insensitive name match).
5. Filter is case-insensitive (UPPER input matches mixed-case name).
6. Filter matches against concept description.
7. Escape key clears filter and restores full list.
8. Clear button (×) appears when non-empty, clears on click.
9. No results message shown when filter matches nothing.
10. Back button navigates to `/courses/$courseId`.

### Verification

```
pnpm --filter @praxis/ui typecheck  ✓  (no errors)
pnpm --filter @praxis/ui test       ✓  (97 files, 822 tests all pass)
pnpm typecheck                      ✓  (all packages clean)
```

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Diff at commit `68ca55d`: new flat-list route created at `/courses/$courseId/concepts` (the implementer's discovery: no such route existed; escape-hatch path taken per the story brief). Grouping by lesson title (units aren't surfaced through artifacts client — documented as the available proxy with "Ungrouped" fallback for concepts in no lesson).
- Filter UX is clean: `<input type="search">`, case-insensitive substring on name + description, Escape clears + blurs, `×` clear button visible when non-empty. Browser's native search-cancel suppressed via `::-webkit-search-cancel-button { display: none }` to avoid double-clear controls.
- 10 new test cases cover empty state, grouping (with/without lesson), filter narrowing, case-insensitivity, description matching, Escape behavior, clear-button behavior, no-results message, navigation back.
- Surfaces a real new capability — a flat-list concepts route — beyond the strict "polish" scope. Worth noting in the feature-level review.

Approved and advancing to done.
