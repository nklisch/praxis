---
id: epic-ui-redesign-ground-up-workspace-catalogue-rebuild
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-note-annotations-and-filters-search-and-filters
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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

- [ ] Catalogue renders the locked layout.
- [ ] Search + filter rail compose with AND semantics.
- [ ] Cards render per artifact type with correct previews.
- [ ] All quality checks green.
