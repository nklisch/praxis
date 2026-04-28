import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { type Schema, schema } from "./all-schemas.js";
import { resolveDbPath } from "./paths.js";

export type PraxisDb = BetterSQLite3Database<Schema>;

let cached: { sqlite: Database.Database; db: PraxisDb; path: string } | null = null;

export interface OpenDbOptions {
  path?: string;
  readonly?: boolean;
}

/** Open (or return cached) Drizzle database. Idempotent within a process. */
export function openDb(opts: OpenDbOptions = {}): { db: PraxisDb; path: string } {
  if (cached && !opts.path) return { db: cached.db, path: cached.path };

  const path = opts.path ?? resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path, { readonly: opts.readonly ?? false });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  if (!opts.path) cached = { sqlite, db, path };
  return { db, path };
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
