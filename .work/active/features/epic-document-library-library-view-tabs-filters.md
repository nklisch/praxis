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
- "Orphaned" definition (resolved): a document surfaces under Orphaned
  if it has **no `document_scopes` rows at all**, OR all its scope rows
  point at scopes that are inactive (e.g., a bootstrap session that was
  never confirmed and has been abandoned). Feature-design pass picks the
  detection mechanism — flag on `sessions` for abandoned/unconfirmed
  state, or a derived check via a join against the parent. The literal
  database-only definition ("no rows at all") is too strict because
  abandoned-bootstrap docs would silently disappear from the library;
  the user explicitly wants them findable under Orphaned (see
  `bootstrap-session-scoped-attachment` for the matching GC decision).
- Filters: file type (from `documents.mimeType`), ingestion source
  (`source` column on scope row), date range (`attached_at` or
  `documents.ingestedAt`?).
- Bulk affordances (resolved): **out of scope** for v1. Library v1 =
  tabs + filters + open-in-viewer. No multi-select rescope/move/detach.
  When actual need surfaces, scope a follow-up story for whichever
  bulk op users ask for first.
- Interaction with the document viewer tab from
  `viewer-tab-scoped-sidebar` — clicking a row should `openDocumentInTab`
  using the same helper.
