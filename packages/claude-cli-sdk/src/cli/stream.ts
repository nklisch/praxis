import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { CLIError, CLITimeoutError } from "../errors.js";
import type { StreamEvent } from "../types/index.js";
import { parseStreamLine } from "./parser.js";

// ============================================
// STREAM EVENTS ASYNC GENERATOR
// ============================================

export async function* streamEvents(
  proc: ChildProcess,
  timeout: number,
): AsyncGenerator<StreamEvent> {
  const rl = createInterface({ input: proc.stdout! });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const lineQueue: string[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;

  rl.on("line", (line: string) => {
    lineQueue.push(line);
    resolveNext?.();
    resolveNext = null;
  });

  rl.on("close", () => {
    done = true;
    resolveNext?.();
    resolveNext = null;
  });

  const stderrChunks: string[] = [];
  proc.stderr?.on("data", (chunk: unknown) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
  });

  timeoutId = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");
    done = true;
    resolveNext?.();
    resolveNext = null;
  }, timeout);

  let gotResult = false;

  try {
    while (true) {
      while (lineQueue.length > 0) {
        const line = lineQueue.shift()!;
        const event = parseStreamLine(line);
        if (event) {
          yield event;
          if (event.type === "result") {
            gotResult = true;
          }
        }
      }

      // Stop once we have the result event or readline closed
      if (gotResult || done) break;

      await new Promise<void>((resolve) => {
        // Re-check done after setting resolveNext to prevent a race where
        // the 'close' event fires between the done check above and here
        resolveNext = resolve;
        if (done) resolve();
      });
    }
  } finally {
    clearTimeout(timeoutId);
    rl.close();
  }

  if (timedOut) {
    throw new CLITimeoutError(timeout);
  }

  // If we got a result, don't block on process exit — it may linger during cleanup
  if (gotResult) return;

  // Wait for process to close and check exit code
  const exitCode = await new Promise<number>((resolve) => {
    if (proc.exitCode !== null) {
      resolve(proc.exitCode);
      return;
    }
    proc.on("close", (code: number | null) => resolve(code ?? 0));
  });

  if (exitCode !== 0) {
    const stderr = stderrChunks.join("");
    throw new CLIError(exitCode, stderr);
  }
}
