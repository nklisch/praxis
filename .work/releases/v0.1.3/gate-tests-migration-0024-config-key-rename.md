---
id: gate-tests-migration-0024-config-key-rename
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `0024_rename-bootstrap-config-key.sql` migration is not regression-tested

## Priority
Medium

## Spec reference
Item: `refactor-rename-step-4-service-and-ipc`

Acceptance criterion: "`pnpm db:migrate` applies the config_kv key rename
cleanly." Plus the atomic-step note that the migration is forward-only and
rollback requires manual SQL.

The migration is a single
`UPDATE config_kv SET key = 'course-create' WHERE key = 'bootstrap'`. If
the value column's JSON content references the old name internally (config
payload shape), the rewrite is incomplete. No test seeds a row, runs the
migration, and asserts both key and the readable shape.

## Gap type
missing test for migration contract

## Suggested test
```ts
// packages/core/src/__tests__/migration-0024-rename-bootstrap-config-key.test.ts (new)
it("rewrites config_kv key 'bootstrap' to 'course-create' while preserving JSON value", async () => {
  // Apply migrations through 0023; insert config_kv row with key='bootstrap',
  // value=<budget config JSON>; apply 0024; assert row now has key='course-create'
  // AND the JSON value is byte-identical.
});
it("is idempotent — running twice on an already-migrated DB does not throw", async () => { /* ... */ });
```

## Test location (suggested)
`packages/core/src/__tests__/migration-0024-rename-bootstrap-config-key.test.ts` (new)

## Resolution (2026-05-18)

**Not implementing pre-release.** Same reasoning as
`gate-tests-migration-0023-bootstrap-mode-rename`: no users with stored
`config_kv` rows keyed `bootstrap` exist in production, so the
`bootstrap → course-create` rename has no legacy-data path to verify.
Developer DBs have already been migrated; `pnpm db:reset` rebuilds clean.

If the project ever ships to users with persisted data, re-open and
implement the test. Until then, current schema correctness is verified by
ordinary `pnpm db:reset && pnpm test` runs.
