import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { afterEach, beforeEach } from "vitest";

// Absolute path to the repo root's drizzle/ migrations folder.
// Using import.meta.url so this works regardless of what process.cwd() is.
const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export interface TempDbContext {
  /** Temp directory holding the database. */
  readonly tmpDir: string;
  /** Absolute path to the SQLite file. */
  readonly dbPath: string;
}

export interface UseTempDbOptions {
  /** Apply migrations in beforeEach. Default: true. Set false when the test
   *  case wants to apply migrations manually (e.g., to assert migration behavior). */
  migrate?: boolean;
}

/**
 * Per-test temp SQLite database. Sets PRAXIS_DB_PATH so openDb() resolves
 * here, applies migrations (unless opts.migrate === false), and tears
 * everything down + cleans up after each test. Returns a context object
 * whose fields are populated lazily inside beforeEach.
 *
 * Usage:
 *   const db = useTempDb();
 *   it("does the thing", () => {
 *     const { db: client } = openDb({ path: db.dbPath });
 *     // ...
 *   });
 */
export function useTempDb(opts: UseTempDbOptions = {}): TempDbContext {
  const ctx: { tmpDir: string; dbPath: string } = { tmpDir: "", dbPath: "" };
  const migrate = opts.migrate !== false;

  beforeEach(() => {
    ctx.tmpDir = mkdtempSync(join(tmpdir(), "praxis-test-"));
    ctx.dbPath = join(ctx.tmpDir, "test.db");
    process.env.PRAXIS_DB_PATH = ctx.dbPath;
    if (migrate) runMigrations({ path: ctx.dbPath, migrationsFolder: MIGRATIONS_FOLDER });
  });

  afterEach(() => {
    closeDb();
    delete process.env.PRAXIS_DB_PATH;
    rmSync(ctx.tmpDir, { recursive: true, force: true });
  });

  return ctx as TempDbContext;
}
