/**
 * `NodeWorker` — typed handle to a forked Node-mode child process.
 *
 * This is the PORT. The Electron-side adapter that creates one (via
 * `child_process.fork` with `ELECTRON_RUN_AS_NODE=1` and
 * `execPath: process.execPath`) lives in @praxis/desktop. Consumers see only
 * this interface — no Electron coupling leaks into service code.
 *
 * Why we need this at all: Electron 21+'s V8 memory cage rejects external
 * ArrayBuffers used by some native modules (notably onnxruntime-node, which
 * @huggingface/transformers depends on for embeddings). Loading them into the
 * GUI main process kills the app with SIGTRAP on first use. Running them in
 * the same Electron binary launched in `ELECTRON_RUN_AS_NODE` mode bypasses
 * the runtime sandbox check while still giving us a single self-contained
 * binary that consumers don't need to install Node separately for.
 *
 * The worker speaks the JSON-IPC protocol declared in
 * `./worker-protocol.ts`. The worker side uses `runWorkerHost(methods)` from
 * `./worker-host.ts` to register handlers; this side calls `request()`.
 */
export interface NodeWorker {
  /**
   * Send a typed request and await the response. The `method` must match a
   * key registered with `runWorkerHost` on the worker side. Rejects if the
   * worker has been shut down, has crashed, or the handler threw.
   */
  request<T = unknown>(method: string, args: unknown): Promise<T>;

  /**
   * Tear the worker down. Idempotent. Pending requests reject with a
   * "worker shutdown" error. Safe to call from a shutdown chain.
   */
  shutdown(): Promise<void>;

  /** Coarse health probe. False after `shutdown()` or after a crash. */
  isAlive(): boolean;
}
