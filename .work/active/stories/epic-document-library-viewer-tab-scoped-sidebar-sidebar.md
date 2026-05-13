---
id: epic-document-library-viewer-tab-scoped-sidebar-sidebar
kind: story
stage: implementing
tags: [ui, documents]
parent: epic-document-library-viewer-tab-scoped-sidebar
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Scope-aware sidebar

## Scope

`useDerivedScope()` hook implementing the 4-branch decision tree (course route → course scope; bootstrap tab → session scope; document tab → doc's primary scope; otherwise → `null`/"all"). Sidebar component consumes the derived scope to filter the document listing.

## Units in this story (per parent feature's Story 3)

- `useDerivedScope()` hook
- Sidebar component (find current path during impl; likely `packages/ui/src/components/sidebar*.tsx`)
- Empty-state UX when scope yields zero docs
- 4 branch tests + 1 empty-state test

## Acceptance Criteria

- [ ] Sidebar in course route shows that course's documents.
- [ ] Sidebar in bootstrap session shows that session's documents.
- [ ] Sidebar in document tab shows that document's primary scope's documents.
- [ ] Sidebar in library route / no relevant tab shows full library.
- [ ] All four `useDerivedScope` branches have unit-test coverage.

## Out of scope

- The tab-kind foundation (story `…-tab-kind` — but this sidebar story doesn't actually need the document tab kind to exist; it just adds another branch when it does).
