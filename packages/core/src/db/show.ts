import type { Database } from "better-sqlite3";
import { openDb } from "./index.js";

export interface TableInfo {
  name: string;
  rowCount: number;
}

/** Return all user tables and their row counts. Used by `pnpm db:show`. */
export function listTables(opts: { path?: string } = {}): TableInfo[] {
  const dbOpts: import("./index.js").OpenDbOptions = opts.path ? { path: opts.path } : {};
  const { db } = openDb(dbOpts);
  // Drizzle exposes the underlying better-sqlite3 connection via the run-time client.
  // Use raw SQL because we want SQLite metadata, not Drizzle table state.
  const sqlite = (db as unknown as { $client: Database }).$client;
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' ORDER BY name",
    )
    .all() as Array<{ name: string }>;
  return tables.map(({ name }) => {
    const row = sqlite.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number };
    return { name, rowCount: row.c };
  });
}
