---
id: epic-document-library-viewer-tab-scoped-sidebar-tab-kind
kind: story
stage: review
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

## Implementation Notes

### Discriminated union downstream impact

When `TabSummary` became `SessionTabSummary | DocumentTabSummary`, six session-mode
tab-body components (`QuizTabBody`, `HomeworkTabBody`, `ExamTabBody`, `BootstrapTabBody`,
`StudySkillsTabBody`, `TeachChatTabBody`) accessed `tab.sessionId`, `tab.modeId`, or
`tab.assignmentId` directly. Rather than add optional fields to both union variants
(which would defeat type safety), these components' prop types were narrowed to
`SessionTabSummary`. The top-level `ChatTabBody` dispatcher was extended with a
`kind === "document"` branch (placeholder div for now — the real viewer lands in the
sibling viewer story).

### Drizzle left-join with nullable join key

`listOpen`, `list`, and `get` now use `leftJoin(sessions, sql\`${tabs.sessionId} = ${sessions.id}\`)`.
The `sql` template literal is required because Drizzle's `eq(tabs.sessionId, sessions.id)`
path crashes at runtime when `tabs.sessionId` is nullable and the dist build is stale.
After the memory package dist was rebuilt (`pnpm --filter @praxis/memory build`),
the join resolved correctly and all tests passed.

### Migration strategy

SQLite does not support `ALTER COLUMN`, so migration 0016 uses the standard
table-recreation pattern: create `tabs_new` with the new schema, `INSERT INTO … SELECT`
(backfilling `kind = 'session'`, `document_id = NULL`), drop old, rename new, recreate
indexes. The Drizzle snapshot (`0015_snapshot.json`) was hand-authored because
`drizzle-kit generate` (native-preview) cannot handle this change automatically; the
snapshot's `prevId` links to 0014 and the new UUID was generated deterministically.
