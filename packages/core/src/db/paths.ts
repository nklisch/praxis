import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the on-disk SQLite path. Honors PRAXIS_DB_PATH for tests and dev;
 * falls back to a per-OS app data directory.
 */
export function resolveDbPath(): string {
  const override = process.env.PRAXIS_DB_PATH;
  if (override) return override;

  if (process.env.NODE_ENV !== "production") {
    return join(process.cwd(), ".praxis", "dev.db");
  }

  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Praxis", "praxis.db");
    case "win32":
      return join(process.env.APPDATA ?? homedir(), "Praxis", "praxis.db");
    default:
      return join(homedir(), ".local", "share", "praxis", "praxis.db");
  }
}
