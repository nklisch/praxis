---
id: epic-document-library-library-view-tabs-filters
kind: feature
stage: drafting
tags: [ui, documents]
parent: epic-document-library
depends_on: [epic-document-library-scopes-primitive]
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Library route with scope tabs and filters

## Brief

Today the global "all my documents" surface — to the extent it exists —
is a flat list. Once a user has more than a handful of attached documents
spanning multiple courses and bootstrap sessions, the list becomes
useless: there's no way to ask "show me docs from THIS course" or "show
me docs that were attached during THIS bootstrap session but never
promoted" without manually scanning.

This feature promotes the global doc view into a **library route** with
tabs that pivot by scope: "All," "This course" (when in a course
context), "This session" (when in a bootstrap context), "Orphaned" (docs
with no scope rows, or only rows pointing at deleted scopes), and
filters within each tab (file type, ingestion source, date range). Tabs
anchor the common pivots; filters refine within a tab. The tabs and
filters all read through the `document_scopes` primitive — this feature
is the realization of "scope-aware navigation" at the global level,
complementing the scope-aware sidebar that ships in
`viewer-tab-scoped-sidebar`.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: consumer of the new scoping primitive; wave 2
  alongside `bootstrap-session-scoped-attachment` and
  `viewer-tab-scoped-sidebar`.

## Foundation references

- `docs/ARCHITECTURE.md` "Document scoping" section + "Student surface"

## Anchors

- Today's library entry point — `packages/ui/src/components/add-document-button.tsx`
  (mounted in current library surface)
- TanStack Router routes — `packages/ui/src/routes/` (add `/library` or
  similar; coordinate with existing route conventions)
- Document scopes service (new) —
  `DocumentScopesServiceImpl` from the primitive feature; needs query
  helpers like `listAll`, `listByScope`, `listOrphaned`
- Editorial primitives — `RouteHeader`, `LibrarySection`, `EmptyState`,
  `LoadingState` (per `editorial-ui-primitives` pattern)

## Design notes for feature-design

- Tab definition: which scope tabs are always visible, which are
  context-dependent ("This course" only when a course is active)?
- "Orphaned" definition — docs with no `document_scopes` rows, or docs
  whose only rows point at deleted parents? Decide which.
- Filters: file type (from `documents.mimeType`), ingestion source
  (`source` column on scope row), date range (`attached_at` or
  `documents.ingestedAt`?).
- Bulk affordances: rescope / move / detach selected docs? Out-of-scope
  for v1 of this feature or in-scope?
- Interaction with the document viewer tab from
  `viewer-tab-scoped-sidebar` — clicking a row should `openDocumentInTab`
  using the same helper.
