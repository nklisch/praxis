import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { PyodideInterface } from "pyodide";
import { loadPyodide } from "pyodide";

const requireFromHere = createRequire(import.meta.url);

export interface PyodideHostOptions {
  /** Packages to preload. Defaults to ["sympy"]. */
  packages?: string[];
  /** Override pyodide's indexURL — useful for tests pointing at a fixture. */
  indexURL?: string;
  /**
   * Worker isolation is the production default so a timed-out Python run can be
   * terminated even when the Python code is CPU-bound.
   */
  executionMode?: "worker" | "in-process";
}

/**
 * Singleton manager for a Pyodide interpreter loaded into this Node process.
 * Loads lazily on first `get()`. Subsequent calls return the same instance.
 *
 * Thread-safety / concurrency: Pyodide runs on the host's JS event loop —
 * concurrent `runPythonAsync` calls are serialized by Pyodide itself.
 * Callers that need parallelism should not expect it from a single host.
 */
export class PyodideHost {
  private instance: PyodideInterface | null = null;
  private loadPromise: Promise<PyodideInterface> | null = null;
  private isolatedWorker: IsolatedPyodideWorker | null = null;
  private executionQueue: Promise<void> = Promise.resolve();
  private nextRunId = 0;
  private readonly packages: string[];
  private readonly indexURL: string | undefined;
  private readonly executionMode: "worker" | "in-process";
  private readonly pyodideSpecifier: string;
  private readonly pyodideIndexURL: string;

  constructor(opts: PyodideHostOptions = {}) {
    this.packages = opts.packages ?? ["sympy"];
    if (opts.indexURL !== undefined) this.indexURL = opts.indexURL;
    this.executionMode = opts.executionMode ?? "worker";
    const pyodideDir = dirname(requireFromHere.resolve("pyodide/package.json"));
    this.pyodideSpecifier = pathToFileURL(join(pyodideDir, "pyodide.mjs")).href;
    this.pyodideIndexURL = `${pyodideDir}/`;
  }

  /** Return the Pyodide instance, loading it on first call. */
  async get(): Promise<PyodideInterface> {
    if (this.instance) return this.instance;
    if (!this.loadPromise) {
      this.loadPromise = this.loadInternal();
    }
    this.instance = await this.loadPromise;
    return this.instance;
  }

  /** Eagerly load — call from app startup so the first tool call has no latency. */
  async preload(): Promise<void> {
    await this.get();
  }

  private async loadInternal(): Promise<PyodideInterface> {
    const py = await loadPyodide(
      this.indexURL !== undefined ? { indexURL: this.indexURL } : undefined,
    );
    if (this.packages.length > 0) {
      await py.loadPackage(this.packages);
    }
    return py;
  }

  /**
   * Run Python with a wall-clock timeout. The default worker mode terminates
   * the isolated interpreter on timeout so stale Python cannot affect later
   * calls. The in-process path exists for low-level unit tests and uses
   * Pyodide's interrupt buffer before waiting for the run to settle.
   */
  async runPython(opts: PyodideRunOptions): Promise<PyodideRunResult> {
    const run = this.executionQueue.then(() =>
      this.executionMode === "worker"
        ? this.runPythonInWorker(opts)
        : this.runPythonInProcess(opts),
    );
    this.executionQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async runPythonInProcess(opts: PyodideRunOptions): Promise<PyodideRunResult> {
    const py = await this.get();
    const stdoutBuffer: string[] = [];
    const stderrBuffer: string[] = [];
    const interruptBuffer = new Int32Array(new SharedArrayBuffer(4));
    const interruptible = py as InterruptiblePyodideInterface;

    py.setStdout({ batched: (s) => stdoutBuffer.push(s) });
    py.setStderr({ batched: (s) => stderrBuffer.push(s) });
    interruptible.setInterruptBuffer(interruptBuffer);

    const start = Date.now();
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const runPromise = py.runPythonAsync(opts.code);

    try {
      await Promise.race([
        runPromise,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            Atomics.store(interruptBuffer, 0, PYODIDE_SIGINT);
            reject(new PyodideTimeoutError(`Python execution exceeded ${opts.timeoutMs}ms`));
          }, opts.timeoutMs);
        }),
      ]);
      return {
        stdout: stdoutBuffer.join(""),
        stderr: stderrBuffer.join(""),
        durationMs: Date.now() - start,
        timedOut: false,
      };
    } catch (err) {
      if (timedOut || err instanceof PyodideTimeoutError) {
        await runPromise.catch(() => undefined);
        return {
          stdout: stdoutBuffer.join(""),
          stderr: stderrBuffer.join(""),
          durationMs: Date.now() - start,
          timedOut: true,
        };
      }
      // Python error — Pyodide writes the traceback to stderr already.
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        stdout: stdoutBuffer.join(""),
        stderr: `${stderrBuffer.join("")}\n${errMsg}`,
        durationMs: Date.now() - start,
        timedOut: false,
        pythonError: errMsg,
      };
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      interruptible.setInterruptBuffer(undefined);
      py.setStdout({});
      py.setStderr({});
    }
  }

  private async runPythonInWorker(opts: PyodideRunOptions): Promise<PyodideRunResult> {
    const isolated = await this.getIsolatedWorker();
    const worker = isolated.worker;
    const id = ++this.nextRunId;
    const stdoutBuffer: string[] = [];
    const stderrBuffer: string[] = [];
    const start = Date.now();

    return new Promise<PyodideRunResult>((resolve) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
        worker.off("message", onMessage);
        worker.off("error", onError);
        worker.off("exit", onExit);
      };

      const finish = (result: PyodideRunResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const onMessage = (message: unknown) => {
        if (!isRunWorkerMessage(message) || message.id !== id) return;
        switch (message.type) {
          case "stdout":
            stdoutBuffer.push(message.chunk);
            return;
          case "stderr":
            stderrBuffer.push(message.chunk);
            return;
          case "result":
            finish({
              stdout: message.stdout,
              stderr: message.stderr,
              durationMs: Date.now() - start,
              timedOut: false,
              ...(message.pythonError !== undefined && { pythonError: message.pythonError }),
            });
            return;
        }
      };

      const onError = (err: Error) => {
        this.disposeWorker(worker);
        finish({
          stdout: stdoutBuffer.join(""),
          stderr: `${stderrBuffer.join("")}\n${err.message}`,
          durationMs: Date.now() - start,
          timedOut: false,
          pythonError: err.message,
        });
      };

      const onExit = (code: number) => {
        if (settled) return;
        this.disposeWorker(worker);
        const message = `Pyodide worker exited before completing run (code ${code})`;
        finish({
          stdout: stdoutBuffer.join(""),
          stderr: `${stderrBuffer.join("")}\n${message}`,
          durationMs: Date.now() - start,
          timedOut: false,
          pythonError: message,
        });
      };

      worker.on("message", onMessage);
      worker.on("error", onError);
      worker.on("exit", onExit);
      timeoutHandle = setTimeout(() => {
        this.disposeWorker(worker);
        finish({
          stdout: stdoutBuffer.join(""),
          stderr: stderrBuffer.join(""),
          durationMs: Date.now() - start,
          timedOut: true,
        });
      }, opts.timeoutMs);

      worker.postMessage({ type: "run", id, code: opts.code });
    });
  }

  private async getIsolatedWorker(): Promise<IsolatedPyodideWorker> {
    if (this.isolatedWorker) {
      await this.isolatedWorker.ready;
      return this.isolatedWorker;
    }

    const worker = new Worker(PYODIDE_WORKER_CODE, {
      eval: true,
      workerData: {
        packages: this.packages,
        indexURL: this.indexURL,
        pyodideIndexURL: this.pyodideIndexURL,
        pyodideSpecifier: this.pyodideSpecifier,
      },
    });
    const ready = new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        worker.off("message", onMessage);
        worker.off("error", onError);
        worker.off("exit", onExit);
      };

      const onMessage = (message: unknown) => {
        if (!isInitWorkerMessage(message)) return;
        cleanup();
        if (message.type === "ready") {
          resolve();
          return;
        }
        reject(new Error(message.message));
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onExit = (code: number) => {
        cleanup();
        reject(new Error(`Pyodide worker exited during initialization (code ${code})`));
      };

      worker.on("message", onMessage);
      worker.on("error", onError);
      worker.on("exit", onExit);
    }).catch((err: unknown) => {
      this.disposeWorker(worker);
      throw err;
    });

    this.isolatedWorker = { worker, ready };
    await ready;
    worker.unref();
    return this.isolatedWorker;
  }

  private disposeWorker(worker: Worker): void {
    if (this.isolatedWorker?.worker === worker) {
      this.isolatedWorker = null;
    }
    void worker.terminate();
  }
}

export interface PyodideRunOptions {
  code: string;
  timeoutMs: number;
}

export interface PyodideRunResult {
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  pythonError?: string;
}

export class PyodideTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PyodideTimeoutError";
  }
}

const PYODIDE_SIGINT = 2;

type InterruptiblePyodideInterface = Omit<PyodideInterface, "setInterruptBuffer"> & {
  setInterruptBuffer(buffer: Int32Array | undefined): void;
};

interface IsolatedPyodideWorker {
  worker: Worker;
  ready: Promise<void>;
}

type InitWorkerMessage = { type: "ready" } | { type: "init-error"; message: string };

type RunWorkerMessage =
  | { type: "stdout"; id: number; chunk: string }
  | { type: "stderr"; id: number; chunk: string }
  | { type: "result"; id: number; stdout: string; stderr: string; pythonError?: string };

function isInitWorkerMessage(message: unknown): message is InitWorkerMessage {
  if (!isRecord(message) || typeof message.type !== "string") return false;
  if (message.type === "ready") return true;
  return message.type === "init-error" && typeof message.message === "string";
}

function isRunWorkerMessage(message: unknown): message is RunWorkerMessage {
  if (!isRecord(message) || typeof message.type !== "string" || typeof message.id !== "number") {
    return false;
  }
  if (
    (message.type === "stdout" || message.type === "stderr") &&
    typeof message.chunk === "string"
  ) {
    return true;
  }
  return (
    message.type === "result" &&
    typeof message.stdout === "string" &&
    typeof message.stderr === "string" &&
    (message.pythonError === undefined || typeof message.pythonError === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const PYODIDE_WORKER_CODE = `
const { parentPort, workerData } = require("node:worker_threads");

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

(async () => {
  try {
    const { loadPyodide } = await import(workerData.pyodideSpecifier);
    const options = { indexURL: workerData.indexURL ?? workerData.pyodideIndexURL };
    const py = await loadPyodide(options);
    if (workerData.packages.length > 0) {
      await py.loadPackage(workerData.packages);
    }
    parentPort.postMessage({ type: "ready" });
    parentPort.on("message", async (message) => {
      if (!message || message.type !== "run") return;
      const stdout = [];
      const stderr = [];
      py.setStdout({
        batched: (chunk) => {
          stdout.push(chunk);
          parentPort.postMessage({ type: "stdout", id: message.id, chunk });
        },
      });
      py.setStderr({
        batched: (chunk) => {
          stderr.push(chunk);
          parentPort.postMessage({ type: "stderr", id: message.id, chunk });
        },
      });
      try {
        await py.runPythonAsync(message.code);
        parentPort.postMessage({
          type: "result",
          id: message.id,
          stdout: stdout.join(""),
          stderr: stderr.join(""),
        });
      } catch (err) {
        const pythonError = errorMessage(err);
        parentPort.postMessage({
          type: "result",
          id: message.id,
          stdout: stdout.join(""),
          stderr: stderr.join("") + "\\n" + pythonError,
          pythonError,
        });
      } finally {
        py.setStdout({});
        py.setStderr({});
      }
    });
  } catch (err) {
    parentPort.postMessage({ type: "init-error", message: errorMessage(err) });
  }
})();
`;
