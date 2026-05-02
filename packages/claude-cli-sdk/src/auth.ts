import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { CLINotFoundError } from "./errors.js";

/**
 * Output shape of `claude auth status --json`. Forward-compatible with extra
 * fields the CLI may add — we only depend on `loggedIn`.
 */
export interface ClaudeAuthStatus {
  loggedIn: boolean;
  authMethod?: string; // "claude.ai" | "console" | "sso" | string
  apiProvider?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  subscriptionType?: string;
  /** Set when status returned non-zero. The other fields are absent. */
  error?: string;
}

/**
 * Streamed events from `claude auth login`. Producer emits as soon as it can
 * detect each transition; the CLI's exact stdout format is NOT a contract,
 * so the producer is tolerant.
 */
export type ClaudeAuthLoginEvent =
  | { kind: "started" }
  | { kind: "url"; url: string }
  | { kind: "stdout"; line: string } // raw passthrough for diagnostics
  | { kind: "stderr"; line: string }
  | { kind: "succeeded"; status: ClaudeAuthStatus }
  | { kind: "failed"; message: string };

export interface ClaudeAuthLoginOptions {
  /** Auth flow. v1 only supports "claudeai". */
  method?: "claudeai";
  signal?: AbortSignal;
}

// Module-level command override for testability. Not exported publicly.
let _cliCommand = "claude";

/** @internal — test injection only, not part of the public API. */
export function _setCliCommand(cmd: string): void {
  _cliCommand = cmd;
}

/** @internal — reset to default. */
export function _resetCliCommand(): void {
  _cliCommand = "claude";
}

const MAX_STDOUT_BYTES = 8 * 1024; // 8KB paranoid cap

/**
 * Run `claude auth status --json` and parse the JSON output.
 *
 * Resolves with `{ loggedIn: false, error }` on non-zero exit (treat any
 * non-success as "not logged in" — the CLI returns non-zero when no account
 * is configured). Throws only when the CLI binary itself is missing
 * (CLINotFoundError, same as conversation paths).
 */
export function authStatus(): Promise<ClaudeAuthStatus> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(_cliCommand, ["auth", "status", "--json"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      // Synchronous spawn failure — shouldn't happen but handle it
      reject(err);
      return;
    }

    // ENOENT fires as an error event on the process
    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(new CLINotFoundError());
      } else {
        // Other spawn errors: treat as not logged in, don't throw
        resolve({ loggedIn: false, error: err.message });
      }
    });

    let stdoutBuf = "";
    let stderrBuf = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      const remaining = MAX_STDOUT_BYTES - stdoutBuf.length;
      if (remaining > 0) {
        stdoutBuf += chunk.toString("utf8", 0, Math.min(chunk.length, remaining));
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdoutBuf.trim()) as ClaudeAuthStatus;
          resolve(parsed);
        } catch {
          resolve({ loggedIn: false, error: `Failed to parse auth status JSON: ${stdoutBuf}` });
        }
      } else {
        resolve({
          loggedIn: false,
          error: stderrBuf.trim() || `claude auth status exited with code ${code}`,
        });
      }
    });
  });
}

const URL_REGEX = /https?:\/\/[^\s)]+/;
const TRAILING_PUNCT = /[.,)]+$/;

/**
 * Run `claude auth login --claudeai` as a child process and stream events
 * as the CLI progresses.
 */
export async function* authLogin(
  opts?: ClaudeAuthLoginOptions,
): AsyncIterable<ClaudeAuthLoginEvent> {
  const proc = spawn(_cliCommand, ["auth", "login", "--claudeai"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Wire abort signal to SIGTERM
  const onAbort = () => {
    proc.kill("SIGTERM");
  };
  if (opts?.signal) {
    if (opts.signal.aborted) {
      proc.kill("SIGTERM");
    } else {
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  // Queue of pending events to yield
  type QueueItem = ClaudeAuthLoginEvent | { kind: "_done" } | { kind: "_error"; err: Error };
  const queue: QueueItem[] = [];
  let waitResolve: (() => void) | null = null;

  const push = (item: QueueItem) => {
    queue.push(item);
    if (waitResolve) {
      const r = waitResolve;
      waitResolve = null;
      r();
    }
  };

  const waitForMore = (): Promise<void> => {
    if (queue.length > 0) return Promise.resolve();
    return new Promise<void>((r) => {
      waitResolve = r;
    });
  };

  // Yield started immediately after spawn
  push({ kind: "started" });

  let urlEmitted = false;
  const stderrLines: string[] = [];

  // Handle ENOENT
  proc.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      push({ kind: "_error", err: new CLINotFoundError() });
    } else {
      push({ kind: "failed", message: err.message });
      push({ kind: "_done" });
    }
  });

  // Wire readline on stdout. stdout is always available with stdio: ['ignore', 'pipe', 'pipe'].
  // biome-ignore lint/style/noNonNullAssertion: proc.stdout is guaranteed with piped stdio
  const rlStdout = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
  rlStdout.on("line", (line: string) => {
    push({ kind: "stdout", line });

    if (!urlEmitted) {
      const match = URL_REGEX.exec(line);
      if (match) {
        const url = match[0].replace(TRAILING_PUNCT, "");
        urlEmitted = true;
        push({ kind: "url", url });
      }
    }
  });

  // Wire readline on stderr. stderr is always available with stdio: ['ignore', 'pipe', 'pipe'].
  // biome-ignore lint/style/noNonNullAssertion: proc.stderr is guaranteed with piped stdio
  const rlStderr = createInterface({ input: proc.stderr!, crlfDelay: Infinity });
  rlStderr.on("line", (line: string) => {
    stderrLines.push(line);
    push({ kind: "stderr", line });

    if (!urlEmitted) {
      const match = URL_REGEX.exec(line);
      if (match) {
        const url = match[0].replace(TRAILING_PUNCT, "");
        urlEmitted = true;
        push({ kind: "url", url });
      }
    }
  });

  proc.on("close", async (code: number | null) => {
    opts?.signal?.removeEventListener("abort", onAbort);
    if (code === 0) {
      try {
        const status = await authStatus();
        push({ kind: "succeeded", status });
      } catch (err) {
        push({
          kind: "failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      const msg = stderrLines.join("\n").trim() || `claude auth login exited with code ${code}`;
      push({ kind: "failed", message: msg });
    }
    push({ kind: "_done" });
  });

  // Consume from queue
  while (true) {
    await waitForMore();

    while (queue.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: queue.length > 0 guarantees shift() returns a value
      const item = queue.shift()!;

      if (item.kind === "_done") {
        return;
      }
      if (item.kind === "_error") {
        throw item.err;
      }

      yield item as ClaudeAuthLoginEvent;
    }
  }
}
