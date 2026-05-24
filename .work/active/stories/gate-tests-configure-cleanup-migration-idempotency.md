---
id: gate-tests-configure-cleanup-migration-idempotency
kind: story
stage: implementing
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
