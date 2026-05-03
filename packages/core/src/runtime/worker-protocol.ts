/**
 * Wire format for the Node-mode worker RPC.
 *
 * Used by:
 *   - `runWorkerHost(methods)` — the worker-side helper that listens for requests
 *     and dispatches to the registered methods.
 *   - `spawnNodeWorker(opts)` — the host-side factory (in @praxis/desktop) that
 *     forks the worker and proxies typed requests.
 *
 * Both halves agree on a single discriminator: `kind`. Following the project's
 * `discriminated-union-dispatch` pattern, `kind` names the shape of stored /
 * transmitted messages (vs. `type` which is reserved for streamed engine
 * events).
 */

/** A single ready signal sent by the worker once `runWorkerHost` is listening. */
export interface WorkerReady {
  kind: "ready";
}

/** Request from host → worker. `id` correlates the matching response. */
export interface WorkerRequest {
  kind: "request";
  id: number;
  method: string;
  args: unknown;
}

/** Successful response. `result` is the awaited return value of the method. */
export interface WorkerResponseOk {
  kind: "response";
  id: number;
  ok: true;
  result: unknown;
}

/**
 * Failed response. The worker forwards the error message and (when present)
 * the stack so the host can surface it through the existing logger / re-throw
 * with a usable trace.
 */
export interface WorkerResponseErr {
  kind: "response";
  id: number;
  ok: false;
  error: { message: string; stack?: string };
}

export type WorkerResponse = WorkerResponseOk | WorkerResponseErr;

export type WorkerMessage = WorkerReady | WorkerRequest | WorkerResponse;
