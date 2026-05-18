---
id: epic-backend-fills-for-redesign-note-annotations-and-filters-search-and-filters
kind: story
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign-note-annotations-and-filters
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Catalogue search + saved filters — FTS5 + LibraryService

## Scope

Sub-feature B from the parent feature: workspace catalogue search with
the four saved filters.

- Add `session_id` column + backfill on `notes`.
- Add FTS5 virtual tables `notes_fts` and `flashcards_fts` with sync
  triggers.
- New `LibraryService` (or extension of existing artifacts) with
  `search({ query?, sessionId?, orphan?, dueOnly?, recentWindowMs? })`.
- IPC channel `praxis.library.search` + client method.
- Tests covering each filter + combined queries.

See parent feature
`.work/active/features/epic-backend-fills-for-redesign-note-annotations-and-filters.md`.

## Implementation steps

1. Migration A (session_id column):
   - Edit `packages/artifacts/src/schema.ts` to add
     `sessionId: text("session_id")` (nullable, indexed) on `notes`.
   - `pnpm db:generate` → migration SQL.
   - Augment the migration to backfill existing rows from
     `json_extract(context_json, '$.sessionId')` where present.
   - Update `NotesService.create*` paths to set the column alongside
     `contextJson.sessionId`.

2. Migration B (FTS5):
   - New `drizzle/<next>_notes_fts.sql` creating:
     - `notes_fts(body)` FTS5 table with `content='notes'` linked
       table syntax.
     - Triggers `notes_ai`, `notes_ad`, `notes_au` (after-insert,
       after-delete, after-update) to mirror.
     - `flashcards_fts(front, back)` with analogous triggers.

3. Service layer:
   - New `LibraryService` in
     `packages/core/src/services/library-service.ts` (or as methods
     on `ArtifactsService` — judgment call: prefer a new service if
     it adds 5+ methods, else extend).
   - `search({ query?, sessionId?, orphan?, dueOnly?, recentWindowMs? }):
     Promise<LibraryHit[]>`
     - When `query` is set: MATCH against FTS tables; rank by FTS
       relevance.
     - When `sessionId`: filter `notes.session_id = ?` ∪
       `flashcards.source_json -> sessionId = ?` (or whatever
       `sourceJson` carries).
     - When `orphan`: notes/flashcards with no link to a course or
       concept.
     - When `dueOnly`: `flashcards.next_review_at <= now`.
     - When `recentWindowMs`: filter by `updated_at >= now - ms`.
     - Filters compose with AND.
   - `LibraryHit` is a discriminated union of `{ kind: "note", ... }`
     and `{ kind: "flashcard", ... }`.

4. IPC + client:
   - Channel `praxis.library.search` (envelope-wrapped, Zod schema
     for input).
   - Client: `praxisClient.library.search(...)`.

5. Tests:
   - `library-service.test.ts`: per-filter fixtures + combined queries.
   - `notes-fts.test.ts`: insert/update/delete a note → FTS table
     stays in sync.
   - IPC harness for `praxis.library.search`.

6. Quality checks green.

## Acceptance criteria

- [ ] `session_id` column added; backfill populates existing rows
      from JSON where possible.
- [ ] FTS5 tables and triggers exist and stay in sync on note +
      flashcard mutations.
- [ ] `LibraryService.search` returns correct sets for each filter
      independently and combined.
- [ ] FTS-backed `query` search returns ranked results.
- [ ] IPC + client surface round-trips.
- [ ] All quality checks green.

## Out of scope

- Per-format note editor rewrites — separate feature.
- Note re-anchoring on body edits — separate concern.
- Searching across documents (`documents` table) — out of v1 scope.
