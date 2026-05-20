---
id: story-configure-cleanup-migration
kind: story
stage: done
tags: [db, migration, sessions]
parent: feature-configure-mode-session-hygiene
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Drizzle migration — delete legacy configure sessions

## Brief
Hard-delete all rows in `sessions` with `mode_id = 'configure'` as a one-shot
Drizzle migration. Configure sessions are authoring scratchpads; the new
reuse-per-student + library-suppression behavior assumes a clean slate at the
point of upgrade. Drizzle's `__drizzle_migrations` table provides the
idempotency record — no code-level flag needed.

## Implementation

**File**: `drizzle/0025_configure_session_cleanup.sql` (new — the next number
after `0024_rename-bootstrap-config-key.sql`)

```sql
-- Hard-delete legacy configure sessions before the reuse-per-student behavior
-- ships. Configure sessions are authoring scratchpads with no preserved-history
-- value; a clean slate matches the new model where one configure session per
-- student is reused across all configure-route mounts.
DELETE FROM sessions WHERE mode_id = 'configure';
```

**Cascade verification (do this before writing)**: read the `sessions` table FK
definitions and any child tables (likely `episodic_events`, mastery
projections, `gates`, etc.). If any child FK is **not** `ON DELETE CASCADE`,
add explicit cleanup DELETEs to the migration:

```sql
-- example IF a child doesn't cascade:
DELETE FROM episodic_events WHERE session_id IN (
  SELECT id FROM sessions WHERE mode_id = 'configure'
);
```

Order matters: delete children first, then parent.

If running `pnpm db:generate` for the snapshot/journal updates, do so. If the
hand-authored SQL approach is the project's pattern (as `0023` and `0024`
suggest), update `drizzle/meta/_journal.json` manually to register the new
migration.

## Acceptance

- [ ] `pnpm db:migrate` applies the migration without error on a fresh DB
      and on an existing DB
- [ ] After migration on a DB with prior configure rows:
      `SELECT COUNT(*) FROM sessions WHERE mode_id = 'configure'` returns 0
- [ ] No FK constraint errors during migration (cascade or explicit child
      deletes handled)
- [ ] No orphaned child rows in dependent tables (verify with a sample DB)
- [ ] Migration is idempotent (Drizzle's tracker handles re-runs)
- [ ] `pnpm test` does not regress

## Verification

```bash
# Reset to clean state, apply, verify
pnpm db:reset

# Or, to test idempotency on a DB with state:
sqlite3 .praxis/dev.db "INSERT INTO sessions (id, student_id, mode_id, started_at) VALUES ('test-c', 'student-1', 'configure', strftime('%s','now')*1000);"
pnpm db:migrate
sqlite3 .praxis/dev.db "SELECT COUNT(*) FROM sessions WHERE mode_id = 'configure';"
# Should print 0
```

## Patterns
- Drizzle migrations live in `drizzle/`; the journal at `drizzle/meta/_journal.json`
  tracks applied state.
- Hand-authored SQL is fine (see `0023` and `0024`); don't force `db:generate`
  if the existing pattern is hand-authored.

## Implementation Notes

### FK cascade audit findings

All true FK references to `sessions(id)` use `onDelete: "cascade"`:
- `episodic_events.session_id → sessions.id` — CASCADE ✓ (no explicit delete needed)
- `tabs.session_id → sessions.id` — CASCADE ✓ (no explicit delete needed)

Non-FK session_id columns (no explicit delete needed — orphans by design or plain reference metadata):
- `notes.session_id` — plain text, no FK; configure sessions produce no notes
- `document_citations.citing_session_id` — plain text, no FK; configure sessions produce no citations
- `document_scopes.scope_id` — polymorphic, explicitly no FK by design per schema comment
- `assignments.parent_session_id` — plain text, no FK; configure sessions don't spawn assignments
- `sessions.parent_session_id` — self-referential plain text, no FK; configure sessions aren't spawned as children

**No explicit child deletes required.** The migration is a single `DELETE FROM sessions WHERE mode_id = 'configure'` with SQLite cascading the FK-bearing child tables automatically.

### Journal timestamp note

Drizzle's migrator applies migrations using `folderMillis > lastDbMigration.created_at` (from `_journal.json`'s `when` field). The hand-authored 0023/0024 migrations used low `when` values (1747xxx) that happened to be below several auto-generated migration timestamps (up to 1779079160942). The 0025 entry uses `when: 1779235200000` (2026-05-20 UTC), which is strictly greater than all existing entries, ensuring correct application on state-bearing DBs.

### Verification output

- **Fresh DB** (`pnpm db:reset`): 26 migrations applied, `SELECT COUNT(*) FROM sessions WHERE mode_id = 'configure'` → `0`
- **State-bearing DB** (pre-inserted configure session): migration applied, count → `0`
- **Idempotency**: re-running `pnpm db:migrate` → 26 migrations, count stays `0`
- **Test suite**: 428 test files pass, 4553 tests pass, 0 regressions
