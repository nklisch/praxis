import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Apply Drizzle migrations.
 *
 * In dev (electron-vite), `drizzle/` lives at the repo root, four levels above
 * `packages/desktop/out/main/index.js`. In production (packaged), the folder
 * is shipped via electron-builder's `extraResources` and lives at
 * `process.resourcesPath/drizzle`.
 */
export async function applyMigrations(dbPath: string): Promise<void> {
  const drizzleDir = app.isPackaged
    ? join(process.resourcesPath, "drizzle")
    : resolve(__dirname, "../../../../drizzle");
  const { runMigrations } = await import("@praxis/core/db/migrate");
  runMigrations({ path: dbPath, migrationsFolder: drizzleDir });
}

/**
 * Resolve the SQLite path.
 *
 * Precedence:
 *   1. `PRAXIS_DB_PATH` env var (used by tests + advanced config)
 *   2. In packaged builds: `<userData>/praxis.db` — Electron's per-platform
 *      writable location (~/Library/Application Support/Praxis on macOS,
 *      %APPDATA%/Praxis on Windows, ~/.config/Praxis on Linux).
 *   3. In dev: `<repo>/.praxis/dev.db` — committed to .gitignore.
 */
export function resolveDbPath(): string {
  const envPath = process.env["PRAXIS_DB_PATH"];
  if (envPath) return envPath;
  if (app.isPackaged) {
    return join(app.getPath("userData"), "praxis.db");
  }
  return join(process.cwd(), ".praxis", "dev.db");
}
