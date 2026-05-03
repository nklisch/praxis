/**
 * @praxis/core/runtime — small primitives for running Node-native code in a
 * forked child process. See `./node-worker.ts` for the rationale (V8 memory
 * cage / Electron 21+ incompatibility with onnxruntime-node).
 *
 * Import paths:
 *   `@praxis/core/runtime` — full barrel for the host side (Electron main, tests).
 *   `@praxis/core/runtime` — same barrel works inside worker scripts; they
 *                            only need `runWorkerHost`.
 *
 * The Electron-side `spawnNodeWorker(opts)` factory lives in
 * `@praxis/desktop/electron/main/runtime/spawn-node-worker.ts`. It returns
 * a `NodeWorker` typed by this barrel.
 */
export type { NodeWorker } from "./node-worker.js";
export type { WorkerHandler, WorkerMethods } from "./worker-host.js";
export { runWorkerHost } from "./worker-host.js";
export type {
  WorkerMessage,
  WorkerReady,
  WorkerRequest,
  WorkerResponse,
  WorkerResponseErr,
  WorkerResponseOk,
} from "./worker-protocol.js";
