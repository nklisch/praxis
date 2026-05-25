import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import os from "node:os";
import { CLINotFoundError } from "../errors.js";
import { cleanupTempDir } from "../utils.js";

// ============================================
// SPAWN
// ============================================

export interface SpawnResult {
  proc: ChildProcess;
  cleanup: () => Promise<void>;
}

export interface SpawnOptions_SDK {
  workDir?: string;
  env?: Record<string, string>;
  keepStdinOpen?: boolean;
}

/**
 * Kill a process group identified by `pgid` (POSIX only).
 *
 * Sends SIGTERM and — after `graceMs` milliseconds — SIGKILL to any
 * processes that are still alive. On Windows this is a no-op because
 * Windows does not have POSIX process groups; callers fall back to
 * `proc.kill("SIGTERM")` there.
 *
 * This is the group-kill counterpart to the per-process `proc.kill()` call.
 * Because we spawn with `detached: true` the CLI subprocess leads its own
 * process group; killing the group terminates MCP workers, Electron shims,
 * and any other descendants the CLI spawned — not just the CLI itself.
 */
export function killProcessGroup(pgid: number, graceMs = 3_000): void {
  if (os.platform() === "win32") return; // Windows: no POSIX groups
  try {
    process.kill(-pgid, "SIGTERM");
  } catch {
    // pgid already dead — nothing to do
    return;
  }
  // Fire-and-forget SIGKILL after grace period for any lingering processes
  setTimeout(() => {
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // already gone — expected
    }
  }, graceMs).unref();
}

export function spawnCli(
  args: string[],
  options: SpawnOptions_SDK = {},
  tempFiles: string[] = [],
): SpawnResult {
  // Spawn in a new process group on POSIX so we can group-kill the entire
  // CLI subprocess tree (MCP workers, Electron shims, etc.) on session close
  // or desktop shutdown. On Windows `detached: true` creates a new console
  // group — different semantics, but still allows killing the subtree via
  // the process handle.
  const isWin = os.platform() === "win32";

  const spawnOptions: SpawnOptions = {
    cwd: options.workDir,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
    // detached: true puts the child in its own process group (POSIX) /
    // console group (Windows). Combined with killProcessGroup() this lets
    // us SIGTERM/SIGKILL the whole subtree — not just the CLI root.
    detached: true,
  };

  const proc = spawn("claude", args, spawnOptions);

  if (!options.keepStdinOpen) {
    proc.stdin?.end();
  }

  const cleanup = async () => {
    // Best-effort group kill on cleanup so temp-file removal doesn't race
    // with a still-running child process. On Windows fall back to proc.kill.
    const pid = proc.pid;
    if (pid !== undefined) {
      if (isWin) {
        proc.kill("SIGTERM");
      } else {
        killProcessGroup(pid);
      }
    }
    for (const f of tempFiles) {
      await cleanupTempDir(f).catch(() => {});
    }
  };

  return { proc, cleanup };
}

// ============================================
// CHECK FOR ENOENT ON SPAWN ERROR
// ============================================

/** Type guard for Node.js errno exceptions (e.g., ENOENT spawn errors). */
export function isErrnoException(err: Error): err is NodeJS.ErrnoException {
  return "code" in err;
}

export function attachSpawnErrorHandler(proc: ChildProcess, reject: (err: Error) => void): void {
  proc.on("error", (error: Error) => {
    if (isErrnoException(error) && error.code === "ENOENT") {
      reject(new CLINotFoundError());
    } else {
      reject(error);
    }
  });
}
