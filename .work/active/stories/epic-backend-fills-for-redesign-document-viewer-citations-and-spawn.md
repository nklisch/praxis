---
id: epic-backend-fills-for-redesign-document-viewer-citations-and-spawn
kind: story
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign-document-viewer
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Document citations + passage-scoped spawn + cited-passage rendering

## Scope

Units 1 + 3 + 4 + 5 of the parent feature.

- `document_citations` table + `CitationsService`.
- `document_scopes.passage_range_json` column extension.
- `SessionService.spawnFromPassage`.
- `<DocumentTabBody>` highlights cited ranges with a `†` marker.
- IPC + client surfaces.

See parent feature
`.work/active/features/epic-backend-fills-for-redesign-document-viewer.md`.

## Implementation steps

1. Schema:
   - Add `documentCitations` table to
     `packages/artifacts/src/schema.ts`.
   - Add optional `passage_range_json` column to `document_scopes`.
   - `pnpm db:generate`; verify migration.

2. `CitationsService`:
   - New `packages/core/src/services/citations-service.ts`.
   - `record({ documentId, citingSessionId, citingTurnId?, startOffset, endOffset, citedText? })`.
   - `listByDocument(documentId): Promise<Citation[]>`.
   - Unit tests.

3. `DocumentScopesService`:
   - Accept optional `passageRange: { startOffset, endOffset }` on
     attach/upsert.
   - Surface on reads.

4. `SessionService.spawnFromPassage({ studentId, documentId, range })`:
   - Create a teach session for the student.
   - Attach the document as a session scope with the passage range.
   - Inject the passage text into the parent agent's opening turn
     (prepend `<passage>...</passage>` block to the initial user
     message, or however the existing spawn pattern works — match
     `spawnFromAssignment` style).

5. `<DocumentTabBody>` rendering:
   - On mount, fetch citations for the current document via
     `praxisClient.citations.listByDocument`.
   - Wrap ranges with `<mark>` + `†` marker; on click/hover, link
     to the citing session.

6. IPC + client:
   - `praxis.citations.record`, `praxis.citations.listByDocument`.
   - `praxis.sessions.spawnFromPassage` (or extend
     `praxis.sessions.spawn` to accept a passage range).
   - All envelope-wrapped.

7. Tests:
   - Citations round-trip.
   - `spawnFromPassage` integration with a seeded document and
     student.
   - DocumentTabBody rendering test with mocked citations.
   - IPC harness tests.

8. Quality checks green.

## Acceptance criteria

- [ ] `document_citations` table created; records survive round-trip.
- [ ] `spawnFromPassage` opens a session with the passage in the
      agent's opening context.
- [ ] `<DocumentTabBody>` renders `†` markers on cited ranges.
- [ ] All IPC + client surfaces work end-to-end.
- [ ] All quality checks green.

## Out of scope

- Selection action bar UI — Story 2 (`-selection-bar`).
- Re-anchoring citations on document re-ingest — v1 tolerates
  out-of-bounds by skipping the highlight.
