import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { type Schema, schema } from "./all-schemas.js";
import { resolveDbPath } from "./paths.js";
import { initFtsStore, initVectorStore } from "./vector-init.js";

export type PraxisDb = BetterSQLite3Database<Schema>;

let cached: { sqlite: Database.Database; db: PraxisDb; path: string } | null = null;

export interface OpenDbOptions {
  path?: string;
  readonly?: boolean;
  /**
   * When false, skip sqlite-vec and FTS5 virtual table initialization.
   * Useful for tooling (e.g., drizzle-kit studio) that doesn't need the
   * full runtime. Default: true.
   */
  initVectors?: boolean;
}

/** Open (or return cached) Drizzle database. Idempotent within a process. */
export function openDb(opts: OpenDbOptions = {}): {
  db: PraxisDb;
  path: string;
  sqlite: Database.Database;
} {
  if (cached && !opts.path) return { db: cached.db, path: cached.path, sqlite: cached.sqlite };

  const path = opts.path ?? resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path, { readonly: opts.readonly ?? false });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  if (opts.initVectors !== false && !(opts.readonly ?? false)) {
    initVectorStore(sqlite);
    initFtsStore(sqlite);
  }

  if (!opts.path) cached = { sqlite, db, path };
  return { db, path, sqlite };
}

/** Close the cached connection. Test-only. */
export function closeDb(): void {
  if (cached) {
    cached.sqlite.close();
    cached = null;
  }
}

export type { Schema } from "./all-schemas.js";
export { schema } from "./all-schemas.js";
export { resolveDbPath } from "./paths.js";
export { initFtsStore, initVectorStore } from "./vector-init.js";
