---
id: epic-ui-redesign-ground-up-workspace-catalogue-rebuild
kind: story
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-note-annotations-and-filters-search-and-filters
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Workspace catalogue — search + filter rail + artifact cards

## Scope

Rebuild `notes-list.tsx` (or the workspace front route) as the
locked Catalogue per
`.mockups/screens/.../-workspace/option-3.html`:
- Big italic search box at top.
- Left filter rail (format / course / concept + saved filters).
- Result grid with artifact-typed cards.

Consumes `praxisClient.library.search` from the sibling backend
story.

## Implementation steps

1. Edit `packages/ui/src/routes/workspace/notes-list.tsx` (or rename
   to `index.tsx`) to render the Catalogue layout.
2. New `<CatalogueSearchBox>` + `<CatalogueFilterRail>` components.
3. New `<ArtifactCard>` with format-discriminator dispatch (notes /
   flashcards / sketches).
4. Wire to `praxisClient.library.search`.
5. Tests cover search, filter combinations, and card render.
6. Quality checks green.

## Acceptance criteria

- [x] Catalogue renders the locked layout.
- [x] Search + filter rail compose with AND semantics.
- [x] Cards render per artifact type with correct previews.
- [x] All quality checks green.

## Implementation notes

### New files

- `packages/ui/src/components/catalogue-search-box.tsx` + `.module.css` — big italic serif search field; 250 ms debounce; result count on right; uses `<search>` semantic element.
- `packages/ui/src/components/catalogue-filter-rail.tsx` + `.module.css` — left rail with "By format" (`<fieldset>`) and "Saved" (`<fieldset>`) groups; multi-select pills with toggle-to-deselect; `CatalogueFilters` type exported for use by the route.
- `packages/ui/src/components/artifact-card.tsx` + `.module.css` — discriminated card component dispatching on `hit.kind`; `NoteCard` extracts title/excerpt per format (free/cornell/feynman/outline/sketch) from the raw JSON body; `FlashcardCard` shows front as title + back as answer snippet; orphan and due-today tags.

### Modified files

- `packages/ui/src/routes/workspace/notes-list.tsx` — full rewrite as `NotesListTab` (Catalogue). Layout: catalogue head (kicker + h1 + search box) + two-column grid (filter rail left, results grid right). `useResource` calls `client.library.search` with query + saved-filter params; format facet applied client-side. Result count shown in search box after load; empty states differentiated by whether a search/filter is active.
- `packages/ui/src/routes/workspace/notes-list.module.css` — full rewrite to Catalogue layout using design tokens.
- `packages/ui/src/__tests__/helpers/fake-client.ts` — added `library: {} as PraxisClient["library"]` to the stub (field was missing).

### Test files

- `catalogue-search-box.test.tsx` — 7 tests covering debounce timing, count rendering, singular/plural.
- `catalogue-filter-rail.test.tsx` — 8 tests covering toggle/deselect, AND semantics across facets.
- `artifact-card.test.tsx` — 13 tests covering note/flashcard render, sketch preview, click handler, orphan and due-today tags.
- `notes-list-route.test.tsx` — 8 integration tests; rewired to mock `library.search` via `makeFakeClient`.
- `workspace-route.test.tsx` — updated to mock `library.search`; changed empty-state assertion to new Catalogue heading.

### Decisions

- Format facet applied client-side (no round-trip): `library.search` returns all format kinds; format filter is cheap and the result set is already bounded by query/saved params.
- Flashcard card navigation is a no-op for now (full flashcard editor routing is a separate story); clicking a flashcard card does nothing beyond calling `onClick`.
- `<search>` and `<fieldset>` semantic elements used throughout (Biome `useSemanticElements` rule satisfied without suppression).
