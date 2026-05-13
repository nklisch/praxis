---
id: epic-document-library-viewer-tab-scoped-sidebar
kind: feature
stage: drafting
tags: [ui, documents, tutor-ux]
parent: epic-document-library
depends_on: [epic-document-library-scopes-primitive]
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Document viewer tab + scope-aware sidebar

## Brief

Today there's no real document-viewing surface — documents flow through
ingestion, get listed in a sidebar, and the user can preview them only via
modal-ish affordances. The sidebar shows the same doc list regardless of
where the user is in the app. So reading a long PDF or revisiting an
attached lecture is a poor experience.

This feature adds a dedicated **document viewer tab kind** alongside the
existing tab types (`quiz`, `homework`, `exam`, `bootstrap`,
`study_skills`) — see `packages/ui/src/hooks/use-tabs.ts`. Opening a
document opens it as a tab with a real viewer (PDF, plain text, markdown,
HTML at minimum; PPTX/DOCX punt to a structured-render or page-raster
fallback that's already produced during ingestion). The viewer reads
chunk/page data via the existing `documents` service.

Pair this with a **scope-aware sidebar**: instead of always listing the
global document set, the sidebar derives a scope from the active context
— course route → course scope, bootstrap tab → bootstrap-session scope,
no active scope → global library. The sidebar queries
`document_scopes` via the new primitive and renders only the docs visible
in the active scope.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: consumer of the new scoping primitive; wave 2
  alongside `bootstrap-session-scoped-attachment` and
  `library-view-tabs-and-filters`.

## Foundation references

- `docs/ARCHITECTURE.md` "Document scoping" section + "Student surface"
  description of the tab system

## Anchors

- Tab system — `packages/ui/src/hooks/use-tabs.ts` (existing tab kinds;
  add `'document'` here)
- Tab body isolation pattern — see `tab-body-isolation` pattern in
  `.claude/skills/patterns/`
- Sidebar / library — `packages/ui/src/components/` (current sidebar
  component, to be made scope-aware)
- Add document button (for "open" affordance) —
  `packages/ui/src/components/add-document-button.tsx`
- Document chunks for rendering —
  `packages/artifacts/src/schema.ts:264-275` (`documentChunks` with text,
  section, page)
- Embedded images and page rasters — `EmbeddedImageStore` /
  `PageImageStore` (already content-addressed)

## Design notes for feature-design

- Tab kind shape: `{ kind: 'document', documentId, scopeContext? }`.
  Persisted in the `tabs` table (Phase 14 — SPEC.md:20).
- Per-format render: PDF via the page-raster fallback (Vision PDF
  ingestor already produces these), plain-text/markdown rendered from
  `documentChunks`, HTML rendered with sanitization. PPTX/DOCX: render
  from embedded image stores + extracted text.
- Sidebar scope inference (resolved): **derived from active route + active
  tab**. Course route → course scope; bootstrap tab → that bootstrap
  session's scope; library route → unscoped/all. Feature-design pass writes
  the explicit decision tree (which route+tab combos map to which scope,
  and what wins when they conflict).
- Open-in-tab plumbing: reuse `openSessionInTab` pattern from
  `session-tab-open-flow`? Probably a new `openDocumentInTab` helper.
- Empty-state UX for scope with zero attached docs.
