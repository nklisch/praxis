# Pattern: Temp-DB Test Helper

`useTempDb(opts?)` sets up a fresh SQLite database in a per-test temp directory, applies migrations, and tears down cleanly. Call once at `describe` scope; read `db.dbPath` inside `it()` blocks.

## Rationale

Every DB-backed test needs isolated, migration-applied, auto-cleaned storage. A shared helper eliminates 10-line before/afterEach boilerplate in each file and ensures PRAXIS_DB_PATH cleanup even when tests fail.

## Examples

### Example 1: Root integration test — `tests/foundation.test.ts`
**File**: `tests/foundation.test.ts:6,10`
```typescript
import { useTempDb } from "./helpers/db-setup.js";

describe("foundation: migration + schema discovery", () => {
  // migrate: false — this file tests migration behavior itself
  const db = useTempDb({ migrate: false });

  it("opens and applies migrations", () => {
    const result = runMigrations({ path: db.dbPath });
    expect(result.path).toBe(db.dbPath);
  });
});
```

### Example 2: Per-package unit test — relative path from deep directory
**File**: `packages/core/src/__tests__/episodic.test.ts:4`
```typescript
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
// packages/core/src/__tests__/  →  ../../../../  →  tests/helpers/db-setup.js

describe("episodic helpers", () => {
  const db = useTempDb();  // migrate: true (default)

  it("appendEpisodic writes a row", () => {
    const { db: client } = openDb({ path: db.dbPath });
    // ...
  });
});
```

### Example 3: `useTempDb` interface
**File**: `tests/helpers/db-setup.ts`
```typescript
export interface TempDbContext {
  readonly tmpDir: string;  // temp directory path
  readonly dbPath: string;  // absolute path to test.db
}
export interface UseTempDbOptions {
  migrate?: boolean;  // default true — set false to test migration behavior
}

export function useTempDb(opts: UseTempDbOptions = {}): TempDbContext
// registers beforeEach (create tmpDir, set PRAXIS_DB_PATH, optionally runMigrations)
// registers afterEach (closeDb, delete env, rmSync tmpDir)
```

## When to Use

- Any test that calls `openDb()`, reads/writes Drizzle tables, or tests service methods that touch the database
- Always prefer over inline before/afterEach blocks

## When NOT to Use

- Tests that don't touch the database at all — mocking service dependencies is cleaner than spinning up a temp DB
- Tests in `packages/ui` (JSDOM environment) — no DB access in renderer-side tests

## Common Violations

- Opening `openDb()` without going through `db.dbPath` — all DB opens in tests must use `openDb({ path: db.dbPath })`, not the default path resolution (which would use `.praxis/dev.db` and pollute the dev database)
- Sharing one `useTempDb()` across multiple `describe` blocks — each `describe` should call `useTempDb()` independently; the context fields are populated in `beforeEach`, so sharing across describes with different timing may produce stale paths
- Relative import path: from `packages/X/src/__tests__/`, the path is `../../../../tests/helpers/db-setup.js` — count directory levels carefully for new packages at different depths
