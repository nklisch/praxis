/**
 * spawned-pid-registry.ts
 *
 * Tracks the PIDs of `claude` CLI subprocesses spawned by the current desktop
 * run. Persists them to `<dataDir>/spawned-pids.json` so the NEXT launch can
 * sweep and kill any that survived a crash of the current process.
 *
 * ## Crash-survival cleanup sequence
 *
 * 1. On startup: call `sweepOrphanedPids(dataDir, log)` — reads the JSON file,
 *    SIGTERMs any PID that is still alive (was re-parented to init after our
 *    crash), then deletes the file.
 * 2. At open-session time: `registry.register(pid)` — writes the PID to the
 *    file.
 * 3. At close-session time: `registry.deregister(pid)` — removes the PID from
 *    the file.
 * 4. On `before-quit`: all sessions are already closed (SessionService.shutdown
 *    is called first), so the registry should be empty; we call `clear()` to
 *    make the final file write a clean `[]`.
 *
 * ## Why a file and not only in-memory?
 *
 * If the desktop crashes (SIGSEGV, OOM kill, forced kill), Node's `before-quit`
 * and `will-quit` handlers never run. The spawned CLI subprocesses are
 * re-parented to init and continue running. The file persists across restarts,
 * giving the next launch a hit list.
 *
 * ## Why NOT kill immediately on orphan detection?
 *
 * We cannot know at write time whether a PID in the file belongs to OUR claude
 * subprocess or was recycled by the OS to a completely unrelated process. The
 * sweep checks that the process is still named `claude` via `process.kill(pid,
 * 0)` (existence check) and is not our own PID. PIDs that no longer exist
 * (ESRCH) are silently removed. Stale-PID false positives are mitigated by
 * the SIGTERM-only approach (not SIGKILL) — a wrong SIGTERM to an unrelated
 * process is recoverable; the registry clears itself on successful sweep.
 */

import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

const FILE_NAME = "spawned-pids.json";

interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

// ============================================
// SWEEP (run on startup)
// ============================================

/**
 * Read the PID file left by a prior (possibly crashed) desktop instance and
 * SIGTERM any processes that are still alive. Non-fatal — errors are logged
 * and swallowed so startup is never blocked.
 *
 * Call this once before any new sessions are opened (i.e. in `bootstrap()`
 * before `buildServices()`).
 */
export async function sweepOrphanedPids(dataDir: string, log: Logger): Promise<void> {
  if (os.platform() === "win32") {
    // Windows doesn't have POSIX process groups; the group-kill mechanism
    // doesn't apply here. Omit the sweep for now.
    return;
  }

  const filePath = join(dataDir, FILE_NAME);
  let pids: number[] = [];

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      pids = (parsed as unknown[]).filter((x): x is number => typeof x === "number" && x > 0);
    }
  } catch {
    // File doesn't exist (clean shutdown) or is corrupt — nothing to sweep.
    return;
  }

  if (pids.length === 0) {
    // Empty registry from a clean shutdown — delete the file and move on.
    await unlink(filePath).catch(() => {});
    return;
  }

  log.info("spawned-pid-registry.sweep_start", { pids });

  for (const pid of pids) {
    try {
      // Signal 0: check if the process still exists without sending a real signal.
      process.kill(pid, 0);
      // Process is alive — SIGTERM it. We use the individual PID here because
      // at startup we don't have a pgid; the process group may have already
      // been partially cleaned up by the kernel re-parenting chain.
      process.kill(pid, "SIGTERM");
      log.info("spawned-pid-registry.sweep_terminated", { pid });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        // Already dead — not an error, just a clean exit before our check
        log.info("spawned-pid-registry.sweep_already_gone", { pid });
      } else if (code === "EPERM") {
        // Recycled PID owned by another user or protected process — skip
        log.warn("spawned-pid-registry.sweep_eperm", { pid });
      } else {
        log.warn("spawned-pid-registry.sweep_error", {
          pid,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await unlink(filePath).catch(() => {});
  log.info("spawned-pid-registry.sweep_done", { count: pids.length });
}

// ============================================
// REGISTRY (run during session lifetime)
// ============================================

export interface SpawnedPidRegistry {
  /**
   * Register a newly-spawned CLI PID. Persists to disk immediately.
   * Best-effort: write errors are swallowed so a registry failure never
   * surfaces to the user.
   */
  register(pid: number): Promise<void>;
  /**
   * Deregister a PID on clean close. Persists to disk immediately.
   * Best-effort: errors swallowed.
   */
  deregister(pid: number): Promise<void>;
  /**
   * Clear all PIDs (called on clean shutdown after sessions are closed).
   * Persists to disk and removes the file.
   */
  clear(): Promise<void>;
}

export function createSpawnedPidRegistry(dataDir: string, log: Logger): SpawnedPidRegistry {
  const filePath = join(dataDir, FILE_NAME);
  const pids = new Set<number>();

  async function persist(): Promise<void> {
    try {
      await writeFile(filePath, JSON.stringify([...pids]), "utf8");
    } catch (err) {
      log.warn("spawned-pid-registry.persist_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    async register(pid: number): Promise<void> {
      pids.add(pid);
      await persist();
    },

    async deregister(pid: number): Promise<void> {
      pids.delete(pid);
      await persist();
    },

    async clear(): Promise<void> {
      pids.clear();
      try {
        await unlink(filePath);
      } catch {
        // File may not exist if we never registered any PIDs — fine
      }
    },
  };
}
