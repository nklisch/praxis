import { type ChildProcess, fork } from "node:child_process";
import type { NodeWorker, WorkerMessage } from "@praxis/core/runtime";
import type { Logger } from "@praxis/core/types";
import { serializeError } from "@praxis/core/types";

export interface SpawnNodeWorkerOptions {
  /**
   * Absolute path to the worker script. Resolve via
   * `require.resolve("@praxis/<pkg>/<subpath>")` so the path works in dev
   * (`praxis-source` resolves to .ts via tsx loader) and in packaged builds
   * (the `dist/.js` ships inside the asar).
   */
  scriptPath: string;
  /** Stable name for diagnostics (`embeddings`, `sandbox`, `pyodide`, …). */
  name: string;
  log: Logger;
  /** Extra env vars merged on top of `process.env`. ELECTRON_RUN_AS_NODE is forced. */
  env?: Record<string, string>;
}

/**
 * Fork a Node-mode child process and return a typed `NodeWorker` handle.
 *
 * Why this exists: Electron 21+'s V8 memory cage rejects external
 * ArrayBuffers used by onnxruntime-node (and other native modules). Loading
 * those into the GUI main process kills the app with SIGTRAP on first use.
 * Reusing the same Electron binary in `ELECTRON_RUN_AS_NODE` mode runs it as
 * plain Node — same V8 build, but the runtime sandbox check that triggers
 * SIGTRAP is gated on Chromium init paths that this mode skips. Verified
 * empirically on Electron 41 + onnxruntime-node 1.24.3.
 *
 * Lifecycle:
 *   - Spawn lazily on first `request()` would be nicer, but most callers want
 *     to preload. We spawn eagerly and the caller can issue a `preload`
 *     request to warm the model.
 *   - Pending requests are correlated by id. On crash / shutdown they all
 *     reject with a clear error so callers can surface it without hanging.
 *   - `app.on("before-quit")` is wired by the composition root which calls
 *     `worker.shutdown()` — kills the child cleanly.
 *
 * Diagnostics:
 *   - Worker stdout → log.debug at `worker.<name>.stdout`.
 *   - Worker stderr → log.warn at `worker.<name>.stderr`.
 *   - Spawn / ready / exit transitions → log.info.
 */
export function spawnNodeWorker(opts: SpawnNodeWorkerOptions): NodeWorker {
  const log = opts.log.child({ component: `worker.${opts.name}` });

  let child: ChildProcess | null = null;
  let nextId = 0;
  let alive = false;
  let crashError: Error | null = null;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  // Resolved when the worker emits its `ready` message; rejected if it
  // exits before signalling ready.
  let readyResolve!: () => void;
  let readyReject!: (err: Error) => void;
  const ready = new Promise<void>((res, rej) => {
    readyResolve = res;
    readyReject = rej;
  });

  const failPending = (err: Error): void => {
    crashError = err;
    alive = false;
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  };

  // Forward stdout/stderr to the logger so the worker isn't a black box.
  const wireStdio = (proc: ChildProcess): void => {
    proc.stdout?.setEncoding("utf-8");
    proc.stderr?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      log.debug("worker.stdout", { name: opts.name, chunk: chunk.trimEnd() });
    });
    proc.stderr?.on("data", (chunk: string) => {
      log.warn("worker.stderr", { name: opts.name, chunk: chunk.trimEnd() });
    });
  };

  log.info("worker.spawn.start", { scriptPath: opts.scriptPath });
  child = fork(opts.scriptPath, [], {
    execPath: process.execPath, // the Electron binary, run as Node
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...(opts.env ?? {}) },
    silent: true, // capture stdio so we can log it
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });
  alive = true;
  wireStdio(child);

  child.on("message", (raw: unknown) => {
    if (!isWorkerMessage(raw)) return;
    if (raw.kind === "ready") {
      log.info("worker.ready");
      readyResolve();
      return;
    }
    if (raw.kind === "response") {
      const entry = pending.get(raw.id);
      if (!entry) return;
      pending.delete(raw.id);
      if (raw.ok) {
        entry.resolve(raw.result);
      } else {
        const err = Object.assign(new Error(raw.error.message), {
          stack: raw.error.stack ?? undefined,
        });
        entry.reject(err);
      }
    }
    // request kind on this side is a protocol violation; ignore.
  });

  child.on("error", (err) => {
    log.error("worker.error", { err: serializeError(err) });
    readyReject(err);
    failPending(err);
  });

  child.on("exit", (code, signal) => {
    log.info("worker.exit", { code, signal });
    const reason =
      code === 0
        ? "worker exited cleanly"
        : `worker exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
    const err = new Error(reason);
    readyReject(err);
    failPending(err);
    child = null;
  });

  return {
    async request<T>(method: string, args: unknown): Promise<T> {
      if (crashError) throw crashError;
      if (!child) throw new Error("worker shut down");
      await ready;
      return new Promise<T>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, {
          resolve: resolve as (v: unknown) => void,
          reject,
        });
        child?.send({ kind: "request", id, method, args }, (err) => {
          if (err) {
            pending.delete(id);
            reject(err);
          }
        });
      });
    },
    async shutdown(): Promise<void> {
      if (!child) return;
      log.info("worker.shutdown");
      const proc = child;
      child = null;
      alive = false;
      failPending(new Error("worker shutdown"));
      proc.removeAllListeners("message");
      proc.removeAllListeners("error");
      proc.removeAllListeners("exit");
      proc.kill();
    },
    isAlive(): boolean {
      return alive && child !== null;
    },
  };
}

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "ready" || v.kind === "response" || v.kind === "request";
}
