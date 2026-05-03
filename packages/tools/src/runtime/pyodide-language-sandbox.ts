import type {
  LanguageSandbox,
  LanguageSandboxRunOptions,
  LanguageSandboxRunResult,
} from "@praxis/core/types";
import type { PyodideHost } from "./pyodide-host.js";

/**
 * Python adapter — thin wrapper that conforms `PyodideHost.runPython` to
 * the `LanguageSandbox` shape. `PyodideHost` itself stays unchanged so
 * other callers (`PyodideSymPyService`) keep working.
 *
 * Stdin is supported by injecting a small Python preamble that replaces
 * `sys.stdin` with an `io.StringIO` wrapping the supplied string. Same
 * pattern as the previous `LocalCodeSandbox.wrapPythonWithStdin` helper.
 *
 * Memory limits are silently ignored — Pyodide doesn't expose a per-run
 * cap. The Pyodide runtime has its own WASM heap cap set at boot.
 */
export class PyodideLanguageSandbox implements LanguageSandbox {
  readonly language = "python" as const;
  readonly displayName = "Python" as const;
  readonly supportsStdin = true as const;

  constructor(private readonly host: PyodideHost) {}

  async run(opts: LanguageSandboxRunOptions): Promise<LanguageSandboxRunResult> {
    const code = opts.stdin !== undefined ? wrapWithStdin(opts.code, opts.stdin) : opts.code;
    const r = await this.host.runPython({ code, timeoutMs: opts.timeoutMs });
    return {
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.timedOut ? null : r.pythonError ? 1 : 0,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
      truncated: { stdout: false, stderr: false },
      ...(r.pythonError !== undefined && { guestError: r.pythonError }),
    };
  }
}

/** Inject stdin as `sys.stdin` for the user's Python code. */
function wrapWithStdin(userCode: string, stdin: string): string {
  const stdinJson = JSON.stringify(stdin);
  return `
import sys, io
sys.stdin = io.StringIO(${stdinJson})
${userCode}
`.trim();
}
