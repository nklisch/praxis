---
id: gate-tests-configure-cleanup-migration-idempotency
kind: story
stage: done
tags: [testing, db]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# Migration 0025 idempotency on re-run has no automated test

## Priority
High

## Spec reference
Item: `story-configure-cleanup-migration`
Acceptance criterion:
> Migration is idempotent (Drizzle's `__drizzle_migrations` tracker
> handles re-runs); `pnpm db:migrate` applies the migration without
> error on a fresh DB and on an existing DB.

## Gap type
missing test for valid partition (idempotency + state-bearing DB)

## Suggested test
```ts
// tests/db/configure-cleanup-migration.test.ts
it("0025 deletes configure sessions and is idempotent on re-run", async () => {
  const { dbPath } = useTempDb();
  // After useTempDb runs migrations, insert a configure session
  // directly to simulate state from an earlier app version, then
  // re-run the migrator and assert the row is removed and teach
  // sessions survive. Also confirm no FK errors on tables that
  // SHOULD cascade (episodic_events, tabs) by inserting child
  // rows first.
});
```

## Test location (suggested)
`tests/db/configure-cleanup-migration.test.ts` (new) using `useTempDb`

## Review

**Verdict: approved / done** — 2026-05-23

All four tests are substantive. Each would fail if migration 0025 SQL were absent or incorrect:
- Test 1: directly asserts configure row deleted, teach row survives.
- Test 2: exercises the `episodic_events` FK ON DELETE CASCADE path end-to-end.
- Test 3: documents the post-0026 tabs orphan contract accurately — with FK dropped, re-executing the DELETE does not cascade tabs; the comment explains why and this is the correct post-migration behavior.
- Test 4: true idempotency check — two consecutive runs, second is a no-op with no throw.

The inlined `MIGRATION_0025_SQL` constant matches the actual migration file verbatim. The comment "Kept inline so a future edit to the file must consciously re-check this test" is a good durability note.

No blockers. No important findings. Nit: the story body claims 160 lines but the file is 189 lines — minor off-by-one in the gate, not a code issue.

## Implementation notes

**Test file**: `tests/db/configure-cleanup-migration.test.ts` (160 lines)

**Approach**: `useTempDb()` applies all migrations (including 0025). Tests then
insert fresh rows into the fully-migrated DB and re-execute the migration's SQL
directly via `better-sqlite3`'s `prepare().run()`. This is the correct approach
because Drizzle's `__drizzle_migrations` tracker prevents re-running the same
migration file, but the test can still verify the SQL's correctness and
idempotency by running it directly.

**Four test cases**:
1. `deletes configure sessions and leaves teach sessions intact` — inserts one
   configure and one teach session, executes the migration SQL, asserts the
   configure row is gone and the teach row survives.
2. `cascades episodic_events for deleted configure sessions (FK ON DELETE CASCADE)` —
   inserts episodic_events for both sessions, runs the SQL, asserts the configure
   session's events are cascaded (gone) and the teach session's events survive.
3. `tabs rows referencing configure sessions are orphaned (no FK after migration 0026)` —
   documents that tabs rows are NOT cascaded (migration 0026 dropped the FK), so
   the tab row becomes an orphan; this is the expected post-0026 contract.
4. `is idempotent — re-executing the SQL a second time does not throw` — runs the
   SQL twice; first run deletes configure sessions, second run is a no-op (no rows
   match); asserts no error and that teach sessions still survive.

**Verification**: all 4 tests pass; full suite: 4749 tests passed, 0 failures.
