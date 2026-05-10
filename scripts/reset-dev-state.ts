#!/usr/bin/env tsx
/**
 * Reset all per-developer-machine Praxis state to a clean slate.
 *
 * Removes:
 *   - The dev SQLite database(s) (everywhere they could land)
 *   - The page-images directory used by the Vision PDF ingestor
 *   - The activity log file written by the main process
 *   - The transformers.js model cache (in-repo dev path)
 *
 * Does NOT remove:
 *   - `node_modules/` — out of scope (`pnpm install` is the right tool)
 *   - The Electron app-data Chromium cache (Cache, GPUCache, etc.) — those
 *     are Chromium-managed, harmless, and survive cleanly across resets
 *   - Migrations or schema files — that's source code, not state
 *
 * After this runs, the next `pnpm dev` boot creates a fresh DB and
 * applies all migrations from scratch.
 *
 * Cross-platform: uses `node:fs/promises.rm` with `recursive: true,
 * force: true` so missing paths are no-ops, no shell tricks needed.
 *
 * Usage:
 *   pnpm dev:reset                  # default: prompts before deleting
 *   pnpm dev:reset --yes            # skip the prompt
 *   pnpm dev:reset --keep-cache     # preserve transformers model cache
 */
import { rm, stat } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Target {
  /** Absolute path to remove. */
  readonly path: string;
  /** Short label for output. */
  readonly label: string;
  /** Group — controls whether `--keep-*` flags exclude this target. */
  readonly group: "db" | "page-images" | "logs" | "model-cache";
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const skipPrompt = args.has("--yes") || args.has("-y");
  const keepCache = args.has("--keep-cache");

  const targets: Target[] = [];

  // 1. Dev SQLite databases. The Electron main process uses
  //    `process.cwd() + "/.praxis/dev.db"`, where cwd depends on how it's
  //    launched: `pnpm dev` runs the desktop package so cwd is
  //    packages/desktop; CLI scripts (e.g. `pnpm db:migrate`) run from
  //    the repo root. Either path may have an active DB. We sweep both,
  //    plus the SQLite WAL/SHM sidecars.
  for (const root of [REPO_ROOT, join(REPO_ROOT, "packages/desktop")]) {
    const dir = join(root, ".praxis");
    for (const f of ["dev.db", "dev.db-shm", "dev.db-wal"]) {
      targets.push({
        path: join(dir, f),
        label: `${f} (in ${dir.replace(REPO_ROOT, ".")})`,
        group: "db",
      });
    }
  }
  // PRAXIS_DB_PATH override — surface it so the user knows whether their
  // custom path is being touched.
  if (process.env.PRAXIS_DB_PATH) {
    targets.push({
      path: process.env.PRAXIS_DB_PATH,
      label: `PRAXIS_DB_PATH override (${process.env.PRAXIS_DB_PATH})`,
      group: "db",
    });
  }

  // 2. Page images. Default location matches FsPageImageStore's defaults
  //    (see packages/core/src/ingestion/page-images.ts).
  const pageImagesDir = process.env.PRAXIS_PAGE_IMAGES_DIR ?? defaultPageImagesDir();
  targets.push({
    path: pageImagesDir,
    label: `page images (${pageImagesDir})`,
    group: "page-images",
  });

  // 3. Main-process activity log file. Lives at
  //    `<userData>/logs/praxis.log`. The userData dir is the Electron
  //    app-data dir; we infer it from process.platform without spinning
  //    up Electron itself.
  for (const logPath of defaultLogPaths()) {
    targets.push({ path: logPath, label: `log (${logPath})`, group: "logs" });
  }

  // 4. transformers.js model cache (in-repo dev path).
  //    LocalEmbeddingService writes to userData/transformers-cache in
  //    packaged builds and to node_modules/@huggingface/transformers/.cache
  //    in dev. We reset only the dev path; the packaged path is per-user
  //    state outside the repo and not what `dev:reset` is about.
  if (!keepCache) {
    const txCache = join(
      REPO_ROOT,
      "node_modules/.pnpm/@huggingface+transformers@4.2.0/node_modules/@huggingface/transformers/.cache",
    );
    targets.push({
      path: txCache,
      label: "transformers.js model cache (in-repo)",
      group: "model-cache",
    });
  }

  // Filter to targets that actually exist on disk.
  const present: Target[] = [];
  for (const t of targets) {
    if (await exists(t.path)) present.push(t);
  }

  if (present.length === 0) {
    console.log("Nothing to clean — state is already empty.");
    return;
  }

  console.log("This will delete the following:");
  for (const t of present) console.log(`  • ${t.label}`);

  if (!skipPrompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question("\nProceed? (y/N) ")).trim().toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        console.log("Cancelled.");
        return;
      }
    } finally {
      rl.close();
    }
  }

  let removed = 0;
  for (const t of present) {
    try {
      await rm(t.path, { recursive: true, force: true });
      console.log(`removed: ${t.label}`);
      removed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`failed:  ${t.label} — ${msg}`);
    }
  }
  console.log(`\nDone. ${removed}/${present.length} target(s) removed.`);
  console.log("Next `pnpm dev` will boot into a fresh database.");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function defaultPageImagesDir(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Praxis", "document-pages");
    case "win32":
      return join(process.env.APPDATA ?? home, "Praxis", "document-pages");
    default:
      return join(home, ".local", "share", "praxis", "document-pages");
  }
}

/**
 * Possible userData/logs/praxis.log locations across platforms. We can't
 * call Electron's `app.getPath("userData")` from a plain Node script, so
 * we approximate using the @praxis/desktop package name (which Electron
 * uses as the app-data directory name) plus the platform's standard
 * config location. Returns every plausible path; the caller filters by
 * existence.
 */
function defaultLogPaths(): string[] {
  const home = homedir();
  const candidates: string[] = [];
  switch (platform()) {
    case "darwin":
      candidates.push(
        join(home, "Library", "Application Support", "@praxis", "desktop", "logs", "praxis.log"),
        join(home, "Library", "Application Support", "Praxis", "logs", "praxis.log"),
      );
      break;
    case "win32": {
      const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
      candidates.push(
        join(appData, "@praxis", "desktop", "logs", "praxis.log"),
        join(appData, "Praxis", "logs", "praxis.log"),
      );
      break;
    }
    default:
      candidates.push(
        join(home, ".config", "@praxis", "desktop", "logs", "praxis.log"),
        join(home, ".config", "Praxis", "logs", "praxis.log"),
      );
  }
  // Also include the rotated variants (.log.1, .log.2, ...) which pino-roll
  // produces. We don't know how many exist; check a few. Iteration stops at
  // the first missing index, but since `exists()` is the gate later, listing
  // a small upper bound here is fine — the caller filters.
  const out: string[] = [];
  for (const base of candidates) {
    out.push(base);
    for (let i = 1; i <= 10; i++) out.push(`${base}.${i}`);
  }
  return out;
}

void main().catch((err) => {
  console.error("dev:reset failed:", err);
  process.exit(1);
});
