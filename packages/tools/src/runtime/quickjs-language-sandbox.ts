import type {
  LanguageSandbox,
  LanguageSandboxRunOptions,
  LanguageSandboxRunResult,
} from "@praxis/core/types";

const DEFAULT_OUTPUT_LIMIT = 1_000_000;

/**
 * JavaScript sandbox backed by `quickjs-emscripten` — a pure-WASM build of
 * the QuickJS engine. No native bindings, so this works in any Node /
 * Electron / browser environment with no rebuild dance.
 *
 * Each `run()` call constructs a fresh QuickJSRuntime + QuickJSContext.
 * Memory limit applies to the runtime; timeout uses
 * `shouldInterruptAfterDeadline`. Console output is captured by injecting
 * a host-controlled `console` global with `log/warn/info/debug` writing
 * to stdout and `error` writing to stderr.
 *
 * Lazy-loads `quickjs-emscripten` on first `run()` so the import cost
 * (~3MB WASM) only hits when JS is actually executed.
 */
export class QuickJsLanguageSandbox implements LanguageSandbox {
  readonly language = "javascript" as const;
  readonly displayName = "JavaScript" as const;
  readonly supportsStdin = false as const;

  // biome-ignore lint/suspicious/noExplicitAny: quickjs-emscripten's QuickJSWASMModule type
  private modulePromise: Promise<any> | null = null;

  // biome-ignore lint/suspicious/noExplicitAny: quickjs-emscripten module type
  private async getModule(): Promise<any> {
    if (!this.modulePromise) {
      this.modulePromise = (async () => {
        const tx = await import("quickjs-emscripten");
        return tx.getQuickJS();
      })();
    }
    return this.modulePromise;
  }

  async run(opts: LanguageSandboxRunOptions): Promise<LanguageSandboxRunResult> {
    const limit = opts.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT;
    const stdoutBuf: string[] = [];
    const stderrBuf: string[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const truncated = { stdout: false, stderr: false };
    // performance.now() gives sub-millisecond resolution. Date.now() truncates
    // to whole ms, which makes durationMs zero for trivial programs and breaks
    // any "duration is positive" assertion.
    const start = performance.now();

    const QuickJS = await this.getModule();
    const { shouldInterruptAfterDeadline } = await import("quickjs-emscripten");

    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(opts.memoryLimitMb * 1024 * 1024);
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + opts.timeoutMs));
    const ctx = runtime.newContext();

    try {
      installConsole(ctx, {
        appendStdout: (line) => {
          const bytes = Buffer.byteLength(line, "utf8");
          if (stdoutBytes + bytes > limit) {
            truncated.stdout = true;
            return;
          }
          stdoutBytes += bytes;
          stdoutBuf.push(line);
        },
        appendStderr: (line) => {
          const bytes = Buffer.byteLength(line, "utf8");
          if (stderrBytes + bytes > limit) {
            truncated.stderr = true;
            return;
          }
          stderrBytes += bytes;
          stderrBuf.push(line);
        },
      });

      const result = ctx.evalCode(opts.code);
      if (result.error) {
        const err = ctx.dump(result.error);
        result.error.dispose();
        const isTimeout =
          err !== null &&
          typeof err === "object" &&
          "message" in err &&
          typeof err.message === "string" &&
          err.message === "interrupted";
        if (isTimeout) {
          return {
            stdout: stdoutBuf.join(""),
            stderr: stderrBuf.join(""),
            exitCode: null,
            timedOut: true,
            durationMs: performance.now() - start,
            truncated,
          };
        }
        const guestError = formatGuestError(err);
        return {
          stdout: stdoutBuf.join(""),
          stderr: stderrBuf.join(""),
          exitCode: 1,
          timedOut: false,
          durationMs: performance.now() - start,
          truncated,
          guestError,
        };
      }
      result.value.dispose();
      return {
        stdout: stdoutBuf.join(""),
        stderr: stderrBuf.join(""),
        exitCode: 0,
        timedOut: false,
        durationMs: performance.now() - start,
        truncated,
      };
    } catch (err) {
      // Interrupt-handler firing surfaces as a thrown error from evalCode in
      // some quickjs-emscripten versions; detect via message.
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("interrupted");
      return {
        stdout: stdoutBuf.join(""),
        stderr: stderrBuf.join(""),
        exitCode: null,
        timedOut: isTimeout,
        durationMs: performance.now() - start,
        truncated,
        ...(isTimeout ? {} : { guestError: msg }),
      };
    } finally {
      try {
        ctx.dispose();
      } catch {
        /* already disposed */
      }
      try {
        runtime.dispose();
      } catch {
        /* already disposed */
      }
    }
  }
}

interface ConsoleHooks {
  appendStdout: (line: string) => void;
  appendStderr: (line: string) => void;
}

/**
 * Build a `console` global on the QuickJS context that captures output
 * back to host-side buffers. log / warn / info / debug → stdout;
 * error → stderr. Each method takes variadic args, formats them like
 * `console.log` (space-separated, JSON-stringifying objects), appends a
 * trailing newline, and calls the supplied hook.
 *
 * Returns nothing; all handles disposed before return.
 */
// biome-ignore lint/suspicious/noExplicitAny: quickjs-emscripten context type
function installConsole(ctx: any, hooks: ConsoleHooks): void {
  const make = (sink: (line: string) => void) =>
    // biome-ignore lint/suspicious/noExplicitAny: quickjs handle type
    ctx.newFunction("log", (...handles: any[]) => {
      const args = handles.map((h) => ctx.dump(h));
      sink(`${args.map(stringifyForLog).join(" ")}\n`);
    });

  const consoleHandle = ctx.newObject();
  const logFn = make(hooks.appendStdout);
  const errFn = make(hooks.appendStderr);

  ctx.setProp(consoleHandle, "log", logFn);
  ctx.setProp(consoleHandle, "warn", logFn);
  ctx.setProp(consoleHandle, "info", logFn);
  ctx.setProp(consoleHandle, "debug", logFn);
  ctx.setProp(consoleHandle, "error", errFn);
  ctx.setProp(ctx.global, "console", consoleHandle);

  consoleHandle.dispose();
  logFn.dispose();
  errFn.dispose();
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

function formatGuestError(err: unknown): string {
  if (err !== null && err !== undefined && typeof err === "object") {
    const e = err as { message?: unknown; name?: unknown; stack?: unknown };
    const name = typeof e.name === "string" ? e.name : "Error";
    const msg = typeof e.message === "string" ? e.message : String(e.message);
    const header = `${name}: ${msg}`;
    // QuickJS's stack field contains only the frames, not the header line.
    // Prepend name+message so the output matches standard JS Error.stack format.
    return typeof e.stack === "string" ? `${header}\n${e.stack}` : header;
  }
  return String(err);
}
