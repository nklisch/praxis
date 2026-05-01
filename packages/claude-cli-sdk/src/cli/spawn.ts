import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { cleanupTempDir } from '../utils.js';
import { CLINotFoundError } from '../errors.js';

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

export function spawnCli(args: string[], options: SpawnOptions_SDK = {}, tempFiles: string[] = []): SpawnResult {
  const spawnOptions: SpawnOptions = {
    cwd: options.workDir,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  const proc = spawn('claude', args, spawnOptions);

  if (!options.keepStdinOpen) {
    proc.stdin?.end();
  }

  const cleanup = async () => {
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
  return 'code' in err;
}

export function attachSpawnErrorHandler(proc: ChildProcess, reject: (err: Error) => void): void {
  proc.on('error', (error: Error) => {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      reject(new CLINotFoundError());
    } else {
      reject(error);
    }
  });
}
