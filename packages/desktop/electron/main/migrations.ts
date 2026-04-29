import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Apply Drizzle migrations from the repo-root `drizzle/` folder.
 *
 * From packaged Electron, `process.cwd()` is unreliable.
 * We resolve relative to __dirname, which in the built output is:
 *   packages/desktop/out/main/index.js → __dirname = out/main/
 * So ../../../../drizzle walks to repo root.
 *
 * In dev (electron-vite), __dirname resolves similarly.
 */
export async function applyMigrations(dbPath: string): Promise<void> {
  const drizzleDir = resolve(__dirname, "../../../../drizzle");
  const { runMigrations } = await import("@praxis/core/db/migrate");
  runMigrations({ path: dbPath, migrationsFolder: drizzleDir });
}

export function resolveDbPath(): string {
  const envPath = process.env["PRAXIS_DB_PATH"];
  if (envPath) return envPath;
  // Default to app data directory in production; repo root for dev.
  const appDataPath = process.env["APPDATA"] ?? join(process.env["HOME"] ?? ".", ".praxis");
  return join(appDataPath, "dev.db");
}
