# Persistence Or FK Failure

Use when SQLite/Drizzle throws a constraint error, especially document-scope,
session, course, assignment, or parent-child linkage failures.

## First Checks

- Capture the exact SQLite code and stack frame above Drizzle.
- Identify the table and FK relationship involved.
- Check whether the command used a temp DB or accidentally touched
  `.praxis/dev.db`.

## Evidence To Gather

- Stack trace and service method name.
- `sessionId`, `courseId`, `documentId`, `assignmentId`, or scope id.
- DB row counts and relevant table snapshots.
- Migration/schema files for the relationship.

## Commands

```bash
pnpm debug:bundle --out .praxis/debug/bundles --failure-class persistence --title "persistence FK failure" --session <sessionId> --first-bad "<sqlite error>"
pnpm db:show
pnpm db:packs
pnpm db:gates
pnpm vitest run tests/db/sessions-fk-cascade.test.ts
pnpm vitest run tests/db/configure-cleanup-migration.test.ts
```

For replay, use:

```bash
pnpm debug:replay --bundle <bundle-dir> --db <temp-db-path>
```

## Likely Owners

- `packages/core/src/services/document-scopes-service.ts`
- Package schema files under `packages/{core,artifacts,memory,curriculum}/src/schema.ts`
- Root `drizzle/` migrations
- Service method that inserted or deleted the parent row

## Next Debug Step

Read the service transaction around the failing insert/update/delete. Verify
the parent row exists in the same DB and transaction before changing schema or
loosening constraints.
