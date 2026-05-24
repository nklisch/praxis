---
id: feature-empty-session-cleanup-fk-migration
kind: story
stage: implementing
tags: [db, migration, sessions, cleanup]
parent: feature-empty-session-cleanup
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Drop tabs.sessionId FK constraint

## Brief

`feature-empty-session-cleanup` design needs `tabs.sessionId` to be insertable
even when the referenced session row hasn't been persisted yet (the lazy-persist
design defers session row creation until first user_message). Drop the FK
constraint via migration; orphan-tab cleanup moves to the sweep job in story
`feature-empty-session-cleanup-lazy-and-sweep`.

## Scope

1. Add migration `drizzle/<NNNN>_drop_tabs_session_fk.sql` that recreates the
   `tabs` table without the `sessionId → sessions.id` foreign key
   (SQLite doesn't support DROP CONSTRAINT). Preserve all data, all other
   columns, and all indexes.
2. Update the Drizzle schema in `packages/memory/src/schema.ts` to remove
   the `.references(...)` chain on the `tabs.sessionId` column. Add a
   comment naming the sweep job that owns orphan cleanup post-removal.
3. Regenerate Drizzle migration metadata if needed (`pnpm db:generate`
   may be required; check `drizzle/meta/`).
4. Verify `pnpm db:migrate` runs cleanly on a fresh `.praxis/dev.db`, and
   that an INSERT into `tabs` with a non-existent `session_id` succeeds
   afterward.

## Acceptance Criteria

- [ ] Migration file exists at the next `<NNNN>_*` slot.
- [ ] `pnpm db:migrate` runs cleanly against the dev DB.
- [ ] After migration, `INSERT INTO tabs (..., session_id, ...) VALUES (..., 'nonexistent', ...)` succeeds.
- [ ] Existing data preserved across migration (a quick `db:show` before and after the migration shows the same row counts).
- [ ] Drizzle schema `tabs.sessionId` no longer has `.references(...)`.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean (on touched files).
- [ ] `pnpm test` clean (no regressions in tabs-related tests).

## Out of scope

- Orphan-tab cleanup logic (lives in the sweep story).
- Any change to `tabs` IPC channels or client API.
- Cascade-delete behavior changes for the `documentId` FK (untouched).
