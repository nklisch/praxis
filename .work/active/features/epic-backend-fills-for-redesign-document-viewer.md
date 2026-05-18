---
id: epic-backend-fills-for-redesign-document-viewer
kind: feature
stage: drafting
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Document viewer enhancements

## Brief

`DocumentTabBody` exists (`packages/ui/src/components/document-tab-body.tsx`,
78 lines) and renders documents via per-format renderers. The locked
mock for Document mode (`epic-ui-redesign-ground-up-chat-workspace
mode-document.html`) extends this with three new capabilities:

- **Cited-passage highlights** — when the tutor cites a document
  section in a teach session, the cited passage range is recorded;
  later, opening the document in Document mode highlights those
  passages with a `†` marker. Requires a citation-tracking schema
  field on `(documentId, startOffset, endOffset, citingSessionId,
  citingTurnId)`.
- **Text-selection action bar** — when the student selects text in
  the document, a floating action bar appears (`+ note · ↗ ask
  Praxis · + cite · + flashcard`). UI primitive + the four action
  handlers.
- **Scope-aware "ask Praxis" from a passage** — clicking "ask Praxis"
  spawns a teach session scoped to the selected passage. Uses the
  existing `DocumentScopesService` (polymorphic scopes already
  support `(document_id, scope_kind, scope_id)`); this adds the
  spawn path and the passage-context attachment to the parent agent's
  opening turn.

What this feature does **not** cover: the UI mode-body chrome
(already in `chat-workspace`); the underlying document storage or
ingestion (already shipped); the `DocumentScopes` schema itself
(already exists).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **independent** — no within-epic deps.
- UI co-ships with: `epic-ui-redesign-ground-up-chat-workspace`
  implementation (the Document mode body shell).

## Foundation references

- `docs/ARCHITECTURE.md` § "Document scoping" — existing polymorphic
  scopes; this feature adds passage-range scopes
- `packages/ui/src/components/document-tab-body.tsx` — the scaffold
  being extended
- `packages/core/src/services/document-scopes-service.ts` — scope
  service this extends for passage-scoped sessions
- `.mockups/screens/.../-chat-workspace/mode-document.html` — the
  locked mock direction

<!-- Three sub-capabilities (citations, selection bar, scope-aware
ask) likely ship together since they share the document-text-range
contract. -->
