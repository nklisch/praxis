import type { WorkerMessage, WorkerRequest } from "./worker-protocol.js";

/**
 * Function signature each worker method must satisfy. Methods are async,
 * receive a single `args` value, and return a JSON-serializable result.
 */
// biome-ignore lint/suspicious/noExplicitAny: handler args are method-specific; per-worker typing happens at registration site.
export type WorkerHandler = (args: any) => Promise<unknown>;

/**
 * Map of method name → handler. Handed to `runWorkerHost(methods)` by each
 * worker script (e.g. embeddings, sandbox, pyodide).
 */
export type WorkerMethods = Record<string, WorkerHandler>;

/**
 * Host the RPC loop on the worker side. Call this once at the bottom of a
 * worker script after constructing whatever singletons the methods close over.
 *
 * Sends a `{ kind: "ready" }` message immediately so the host knows the
 * worker has wired up its listener. The host treats this as the gate — any
 * `request` calls before `ready` is observed will queue.
 *
 * Process exit semantics: this does NOT call `process.exit()` itself. When
 * the parent kills the child via `child.kill()`, Node tears the process down
 * normally. For SIGINT during dev (Ctrl+C in the parent terminal), the child
 * receives the signal too and exits cleanly via the default handler.
 */
export function runWorkerHost(methods: WorkerMethods): void {
  if (typeof process.send !== "function") {
    throw new Error(
      "runWorkerHost: process.send is unavailable — this script must be launched via child_process.fork() with stdio:'ipc' (which is fork's default).",
    );
  }
  const send = (msg: WorkerMessage): void => {
    process.send?.(msg);
  };

  process.on("message", (raw: unknown) => {
    if (!isWorkerRequest(raw)) return;
    const req = raw;
    const handler = methods[req.method];
    if (!handler) {
      send({
        kind: "response",
        id: req.id,
        ok: false,
        error: { message: `Unknown worker method: ${req.method}` },
      });
      return;
    }
    void Promise.resolve()
      .then(() => handler(req.args))
      .then((result) => {
        send({ kind: "response", id: req.id, ok: true, result });
      })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err));
        send({
          kind: "response",
          id: req.id,
          ok: false,
          error: { message: e.message, ...(e.stack !== undefined && { stack: e.stack }) },
        });
      });
  });

  send({ kind: "ready" });
}

function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === "request" && typeof v.id === "number" && typeof v.method === "string" && "args" in v
  );
}
