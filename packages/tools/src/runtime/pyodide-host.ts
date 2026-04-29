import type { PyodideInterface } from "pyodide";
import { loadPyodide } from "pyodide";

export interface PyodideHostOptions {
  /** Packages to preload. Defaults to ["sympy"]. */
  packages?: string[];
  /** Override pyodide's indexURL — useful for tests pointing at a fixture. */
  indexURL?: string;
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
  private readonly packages: string[];
  private readonly indexURL: string | undefined;

  constructor(opts: PyodideHostOptions = {}) {
    this.packages = opts.packages ?? ["sympy"];
    if (opts.indexURL !== undefined) this.indexURL = opts.indexURL;
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
   * Run Python with a wall-clock timeout. Output goes to the supplied buffers
   * via Pyodide's setStdout/setStderr. Note: timeout via Promise.race does NOT
   * actually interrupt the running Python — the Python keeps running until the
   * next checkpoint. Accept this for Phase 4 (tutor-controlled inputs).
   */
  async runPython(opts: PyodideRunOptions): Promise<PyodideRunResult> {
    const py = await this.get();
    const stdoutBuffer: string[] = [];
    const stderrBuffer: string[] = [];
    py.setStdout({ batched: (s) => stdoutBuffer.push(s) });
    py.setStderr({ batched: (s) => stderrBuffer.push(s) });

    const start = Date.now();
    let timedOut = false;

    try {
      await Promise.race([
        py.runPythonAsync(opts.code),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            timedOut = true;
            reject(new PyodideTimeoutError(`Python execution exceeded ${opts.timeoutMs}ms`));
          }, opts.timeoutMs),
        ),
      ]);
      return {
        stdout: stdoutBuffer.join(""),
        stderr: stderrBuffer.join(""),
        durationMs: Date.now() - start,
        timedOut: false,
      };
    } catch (err) {
      if (timedOut || err instanceof PyodideTimeoutError) {
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
      py.setStdout({});
      py.setStderr({});
    }
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
