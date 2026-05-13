---
id: epic-document-library-viewer-tab-scoped-sidebar-tab-kind
kind: story
stage: implementing
tags: [core, ui, schema]
parent: epic-document-library-viewer-tab-scoped-sidebar
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Tab-kind foundation: `'document'` tabs

## Scope

Extend the tab system to support document-bound tabs alongside session-bound tabs. Schema migration adds `kind` and `document_id` columns to `tabs`; `TabSummary` becomes a discriminated union over `kind: "session" | "document"`; `tabs-service.open()` gets a `kind: "document"` branch; new client method `client.tabs.openDocument({ documentId, title })`; new UI helper `openDocumentInTab`.

After this story, the document tab CAN be opened (and persists), but no body renders yet — that lands in the viewer story.

## Units in this story (per parent feature's Story 1)

- Schema migration (add `kind text NOT NULL default 'session'`, `document_id text`)
- `TabSummary` discriminated union
- `tabs-service.open()` extension (handle `kind: "document"` path)
- IPC channel update for the new shape
- Client method `tabs.openDocument(input)`
- `use-tabs` hook callback `openDocumentTab`
- `openDocumentInTab` helper
- Tests

## Acceptance Criteria

- [ ] Migration runs cleanly on a fresh DB (`pnpm db:reset`).
- [ ] Existing session-tab tests still pass.
- [ ] `client.tabs.openDocument({ documentId, title })` persists a row with `kind = "document"`.
- [ ] Re-opening a document tab via `reopenTab(tabId)` returns the same `TabSummary`.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all green.

## Out of scope

- Document viewer body (story `…-viewer`)
- Scope-aware sidebar (story `…-sidebar`)
