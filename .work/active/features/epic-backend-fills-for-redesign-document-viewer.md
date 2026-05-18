---
id: epic-backend-fills-for-redesign-document-viewer
kind: feature
stage: done
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

## Design decisions

- **One ship across three sub-capabilities** because they all share
  the `DocumentRange` type (`{ documentId, startOffset, endOffset }`)
  and the existing `DocumentScopesService`. Splitting forces three
  near-duplicates of the range contract.
- **Citations live in a new dedicated table.** Scopes are
  course/session-level; a citation is a per-turn, per-range record
  with a different access pattern (read by document id to render
  highlights, read by session id to render "what got cited"). A
  separate table keeps each path indexable.
- **Selection action bar is a UI primitive in `@praxis/ui`** with the
  four actions wired to existing services (`notes.create`,
  `sessions.spawn`, citations service, `flashcards.create`). No new
  backend except citations.
- **Passage-scoped "ask Praxis" reuses `DocumentScopesService`** with
  the existing `scopeKind: "session"` plus a new optional
  `passageRange` JSON column. Alternative — a new `scopeKind:
  "passage"` — was rejected: scopes are about "which docs belong to
  this surface," not "which range within a doc." The range belongs
  on the session-level scope row.

## Architectural choice

Three units; one new table; the rest are extensions.

1. **Citations**: new `document_citations` table; new `CitationsService`
   to record + read.
2. **Selection action bar**: `<SelectionActionBar>` React component
   subscribing to text-selection events from
   `<DocumentTabBody>`. Each action calls an existing service.
3. **Passage-scoped session spawn**: extend `DocumentScopesService`
   with a `passageRange` column on the scope row; extend
   `SessionService.spawn(...)` (or add `spawnFromPassage`) to accept
   a range and pre-attach it.

## Implementation Units

### Unit 1: Citation schema + service

**Files**:
- `packages/artifacts/src/schema.ts` — new `documentCitations` table:
  ```ts
  export const documentCitations = sqliteTable("document_citations", {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    citingSessionId: text("citing_session_id").notNull(),
    citingTurnId: text("citing_turn_id"),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    citedText: text("cited_text"),         // captured snippet for display
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  }, t => ({
    docIdx: index("citations_doc_idx").on(t.documentId),
    sessionIdx: index("citations_session_idx").on(t.citingSessionId),
  }));
  ```
- `packages/core/src/services/citations-service.ts` (new) with
  `record({ documentId, sessionId, turnId?, startOffset, endOffset, citedText? })`
  and `listByDocument(documentId): Promise<Citation[]>`.

### Unit 2: Selection action bar UI

**Files**:
- `packages/ui/src/components/selection-action-bar.{tsx,module.css}`
  (new).
- `packages/ui/src/components/document-tab-body.tsx` — mount the
  action bar; subscribe to `mouseup` events on the document content
  pane; resolve the current selection range; position the bar near
  the selection.
- Actions:
  - `+ note` → `notesService.create({ body: selectedText, context: { documentId, range } })`
  - `↗ ask Praxis` → `sessionService.spawnFromPassage({ documentId, range })` (Unit 3)
  - `+ cite` → `citationsService.record({ ... })`
  - `+ flashcard` → `flashcardsService.create({ front: <user-prompt>, back: selectedText })`

### Unit 3: Passage-scoped session spawn

**Files**:
- `packages/artifacts/src/schema.ts` — add optional
  `passage_range_json` column on `document_scopes` (carries
  `{ startOffset, endOffset }` when present).
- `packages/core/src/services/document-scopes-service.ts` — accept
  and persist the optional range; surface it on reads.
- `packages/core/src/services/session-service.ts` —
  `spawnFromPassage({ studentId, documentId, range }): Promise<SessionId>`
  creates a teach session, attaches the document as a session scope
  with the passage range, and pre-injects the passage text into the
  parent agent's opening turn.

### Unit 4: Cited-passage highlight rendering

**Files**:
- `packages/ui/src/components/document-tab-body.tsx` — on document
  load, fetch citations via `citationsService.listByDocument`; wrap
  cited ranges in a `<mark>` with a `†` marker; on hover/click,
  surface the citing session.

### Unit 5: IPC + client

- `praxis.citations.record`, `praxis.citations.listByDocument`.
- Reuse existing `praxis.sessions.spawn` if it accepts a passage
  range; otherwise add `praxis.sessions.spawnFromPassage`.
- Client surfaces wired accordingly.

### Unit 6: Tests

- `citations-service.test.ts` round-trip.
- `document-tab-body` selection + action bar tests using
  `@testing-library/react`.
- `session-service.spawnFromPassage` integration test with a seeded
  document.
- IPC harness tests for new channels.

## Implementation Order

Two stories:

1. `epic-backend-fills-for-redesign-document-viewer-citations-and-spawn` —
   Units 1 + 3 + 4 + 5 (backend + render) — depends on `[]`.
2. `epic-backend-fills-for-redesign-document-viewer-selection-bar` —
   Unit 2 + 6 (UI primitive) — depends on Story 1 (uses
   `spawnFromPassage` and `citationsService.record`).

## Acceptance Criteria

Aggregate:
- [ ] Citations record and read; cited ranges render with `†` in the
      document viewer.
- [ ] Selection action bar appears on text selection; all four
      actions work end-to-end.
- [ ] `spawnFromPassage` opens a session pre-loaded with the passage;
      the parent agent's first turn references the passage.
- [ ] All quality checks green.

## Risks

- **Selection offsets vs DOM offsets.** Browser selections use DOM
  ranges; the schema stores text offsets. The selection bar must
  resolve DOM range → text offset against the document's rendered
  text. Acceptable for monolithic documents; complex per-block layouts
  may need a different anchoring scheme (paragraph + offset). Story
  notes the limitation.
- **Citation invalidation on document re-ingestion.** If the document
  is re-ingested with a different chunking, offsets become stale.
  v1: leave the citation row; rendering tolerates out-of-bounds
  ranges by skipping the highlight + warning in the dev log.

## Children complete (2026-05-18)

Both child stories are at `stage: done`:
- `epic-backend-fills-for-redesign-document-viewer-citations-and-spawn`
- `epic-backend-fills-for-redesign-document-viewer-selection-bar`

Feature advanced to `stage: review`.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `docs/ARCHITECTURE.md` § "Document scoping" describes `document_scopes` columns without mentioning the new `passage_range_json` column. The "extensible" framing covers it conceptually, so this is low-priority polish.
- `CLAUDE.md` "Where the big pieces live" mentions `spawnFromAssignment` and `spawnFromNote` but not `spawnFromPassage`. Now that both stories are done and the path is fully wired, a one-liner addition would help future agents orient.

**Notes**: Both child stories delivered cleanly and passed individual reviews. The aggregate feature delivers all three promised sub-capabilities: citation recording + highlight rendering (`†` markers), selection action bar with four working handlers, and `spawnFromPassage` for passage-scoped teach sessions. No cross-cutting concerns visible across the two stories. No foundation-doc drift blocking the feature; the two nits above are purely additive documentation polish. Feature advanced to `stage: done`.
