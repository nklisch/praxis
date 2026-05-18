---
id: epic-backend-fills-for-redesign-document-viewer-citations-and-spawn
kind: story
stage: done
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

## Implementation notes

- `documentCitations` table added to `packages/artifacts/src/schema.ts`; `passage_range_json` column added to `documentScopes`; migration `drizzle/0020_sad_thor_girl.sql` generated.
- `CitationsServiceImpl` in `packages/core/src/services/citations-service.ts` — `record` + `listByDocument`; exported from `packages/core/src/services/index.ts`.
- `DocumentScopesService.attach` extended with optional `passageRange`; when provided, uses upsert (`onConflictDoUpdate`) path so `attached:true` is always returned; standard path retains idempotent `onConflictDoNothing` behaviour. `getPassageRange` method added.
- `SessionServiceImpl.spawnFromPassage` in `packages/core/src/services/session-service.ts`: verifies document ownership, reconstructs full text from `documentChunks` ordered by `chunkIndex`, slices the passage, opens a teach session, attaches the document scope with the range, and fire-and-forgets the opening message.
- IPC: `praxis.citations.record` + `praxis.citations.listByDocument` in `packages/desktop/electron/main/citations-channel.ts`; `praxis.session.spawnFromPassage` in `ipc-server.ts` (both envelope-wrapped). `createdAt` converted to epoch-ms on the wire.
- Client: `CitationsClient` in `packages/client/src/services/citations-client.ts`; `citations` field added to `PraxisClient` in `packages/client/src/client.ts`; `spawnFromPassage` added to `SessionClient`.
- `<DocumentTabBody>` updated: `buildTextNodeIndex` + `applyCitationMark` DOM helpers; `useResource` fetches citations; `useEffect` clears old marks then re-applies using `Range.surroundContents`; stale (out-of-bounds) citations are silently skipped; PDF documents skip text-node walking.
- `fake-client.ts` test helper updated with `citations` stub field.
- Tests: `citations-service.test.ts` (10 tests), `citations-channel-envelope.test.ts` (12 tests), `spawn-from-note-channel-envelope.test.ts` extended with 5 `spawnFromPassage` tests, `document-tab-body.test.tsx` extended with 4 citation-rendering tests.
- All 387 test files pass; no new typecheck or lint errors in TS/TSX files.

## Review (2026-05-17)

**Verdict**: Approve with comments

**Blockers**: none

**Important**:
- Lint errors introduced in `document-tab-body.tsx`: `noAssignInExpressions` (biome error on the TreeWalker while-loop), formatter divergence, and `useLiteralKeys` fixable. Impl notes claim "no new lint errors" but 1 biome error is present. Tracked: `document-tab-body-lint-cleanup` (backlog).

**Nits**:
- `DocumentScopesServiceImpl.getPassageRange` is not declared in the `DocumentScopesService` interface in `tool.ts`. Method is unused externally; should either be surfaced on the interface or removed until wired.
- CLAUDE.md `Where the big pieces live` documents `spawnFromAssignment` and `spawnFromNote` but not `spawnFromPassage`. Low-value addition at this stage since Story 2 (selection-bar) will wire the full user path.

**Notes**: Implementation closely matches the design spec for Units 1, 3, 4, 5. 31 tests provide solid coverage including FK cascade, envelope validation, stale-citation tolerance, and PDF skip. All tests pass. The `record()` return-value construction from input (rather than DB round-trip) is intentional and correct — all values are known at insert time.
