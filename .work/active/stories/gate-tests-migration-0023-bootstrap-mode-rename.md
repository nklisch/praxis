---
id: gate-tests-migration-0023-bootstrap-mode-rename
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# Mode-id rename migration (`0023_rename-bootstrap-mode-to-course-create.sql`) has no regression test

## Priority
High

## Spec reference
Item: `refactor-rename-step-3-mode-id`

Acceptance criterion: from the step body — "`pnpm db:migrate` applies
cleanly against a DB with pre-existing `mode_id = 'bootstrap'` rows; verify
SELECT shows `course-create`" and "Migration only updates LIVE rows (no
`ended_at`). Historical rows preserve the audit trail."

The migration touches 4 tables (`sessions`, `prompt_overrides`,
`mode_prompt_appends`, `document_scopes`) with a load-bearing live-vs-ended
distinction. No test exercises it. The acknowledged "atomic, one-way door"
risk and the audit-trail-preservation rule are observable contracts that
should be pinned.

## Gap type
missing test for migration contract

## Suggested test
```ts
// packages/core/src/__tests__/migration-0023-rename-bootstrap-mode.test.ts (new)
it("backfills live sessions but preserves ended sessions for audit", async () => {
  // useTempDb({ skipMigrations: true }); manually apply migrations through 0022;
  // seed 4 rows (live bootstrap, ended bootstrap, live course-create, live teach);
  // apply 0023; assert only the live bootstrap row got rewritten;
  // assert the ended bootstrap row still has mode_id='bootstrap'.
});

it("backfills all prompt_overrides rows regardless of ended state", async () => { /* ... */ });
it("backfills all document_scopes.source = 'bootstrap' rows", async () => { /* ... */ });
```

## Test location (suggested)
`packages/core/src/__tests__/migration-0023-rename-bootstrap-mode.test.ts` (new)
