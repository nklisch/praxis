// isolated-vm is loaded lazily inside run() to avoid crashing the module graph
// on environments where no native prebuild exists (e.g. Node 25, ABI 141).
// vi.mock("isolated-vm", ...) in test files is intercepted at the module-registry
// level, so dynamic import() is still mocked correctly by Vitest.
//
// isolated-vm uses `export = IsolatedVM` (CJS style). Import type with the
// default-import form (esModuleInterop) to get the namespace type.
import type IsolatedVM from "isolated-vm";

export interface IsolatedVmRunOptions {
  code: string;
  timeoutMs: number;
  memoryLimitMb: number;
  /** Max bytes to capture from stdout/stderr each. Default 1_000_000 (1MB). */
  outputLimitBytes?: number;
}

export interface IsolatedVmRunResult {
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  exitCode: number | null;
  truncated: { stdout: boolean; stderr: boolean };
  /** Caught error from guest code (uncaught exceptions). Distinct from timeout. */
  guestError?: string;
}

const DEFAULT_OUTPUT_LIMIT = 1_000_000;

/**
 * Execute JS code in a fresh V8 isolate. Each call creates a new Isolate +
 * Context — cheap (~2-5ms per call). Exposes only `console.{log,error,warn}`
 * to the guest; no `require`, `process`, `fs`, `net`, `fetch`, `globalThis.*`
 * beyond the supplied console.
 *
 * Console output is captured via a host-side reference function. Stdout =
 * console.log + console.warn; stderr = console.error.
 */
export class IsolatedVmHost {
  async run(opts: IsolatedVmRunOptions): Promise<IsolatedVmRunResult> {
    // Lazy import so the module graph doesn't crash on ABI mismatch at import time.
    // isolated-vm uses `export = IsolatedVM` (CJS); esModuleInterop means Node sees
    // the namespace as the module. Test mocks return `{ default: {...} }`, real runtime
    // returns the namespace directly. We use `as unknown as typeof IsolatedVM` to satisfy
    // TypeScript — the actual shape at runtime is always the namespace.
    // biome-ignore lint/suspicious/noExplicitAny: CJS/ESM interop for isolated-vm
    const ivmModule = (await import("isolated-vm")) as any;
    const ivm: typeof IsolatedVM = ivmModule.default ?? ivmModule;

    const limit = opts.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT;

    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const truncated = { stdout: false, stderr: false };

    const isolate = new ivm.Isolate({ memoryLimit: opts.memoryLimitMb });
    let context: IsolatedVM.Context | null = null;

    const start = Date.now();
    try {
      context = await isolate.createContext();
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      // Bridge console to host buffers via reference function.
      const logFn = new ivm.Reference((...args: unknown[]) => {
        const line = `${args.map(stringifyForLog).join(" ")}\n`;
        const bytes = Buffer.byteLength(line, "utf8");
        if (stdoutBytes + bytes > limit) {
          truncated.stdout = true;
          return;
        }
        stdoutBytes += bytes;
        stdoutChunks.push(line);
      });
      const errFn = new ivm.Reference((...args: unknown[]) => {
        const line = `${args.map(stringifyForLog).join(" ")}\n`;
        const bytes = Buffer.byteLength(line, "utf8");
        if (stderrBytes + bytes > limit) {
          truncated.stderr = true;
          return;
        }
        stderrBytes += bytes;
        stderrChunks.push(line);
      });
      await jail.set("__praxisLog", logFn);
      await jail.set("__praxisErr", errFn);

      const setupScript = `
        const console = {
          log: (...args) => __praxisLog.applySync(undefined, args, { arguments: { copy: true } }),
          warn: (...args) => __praxisLog.applySync(undefined, args, { arguments: { copy: true } }),
          error: (...args) => __praxisErr.applySync(undefined, args, { arguments: { copy: true } }),
          info: (...args) => __praxisLog.applySync(undefined, args, { arguments: { copy: true } }),
          debug: (...args) => __praxisLog.applySync(undefined, args, { arguments: { copy: true } }),
        };
      `;
      const setupCompiled = await isolate.compileScript(setupScript);
      await setupCompiled.run(context);

      const userCompiled = await isolate.compileScript(opts.code);
      await userCompiled.run(context, { timeout: opts.timeoutMs });

      return {
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        durationMs: Date.now() - start,
        timedOut: false,
        exitCode: 0,
        truncated,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // isolated-vm throws "Script execution timed out" on timeout.
      if (message.includes("Script execution timed out")) {
        return {
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
          durationMs: Date.now() - start,
          timedOut: true,
          exitCode: null,
          truncated,
        };
      }
      return {
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        durationMs: Date.now() - start,
        timedOut: false,
        exitCode: 1,
        truncated,
        guestError: message,
      };
    } finally {
      if (context) {
        try {
          context.release();
        } catch {
          /* ignore */
        }
      }
      try {
        isolate.dispose();
      } catch {
        /* ignore */
      }
    }
  }
}

function stringifyForLog(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
