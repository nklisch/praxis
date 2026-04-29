import type { CodeSandbox, CodeSandboxInput, CodeSandboxResult } from "@praxis/core/types";
import type { IsolatedVmHost } from "../runtime/isolated-vm-host.js";
import type { PyodideHost } from "../runtime/pyodide-host.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_MB = 128;

export class LocalCodeSandbox implements CodeSandbox {
  constructor(
    private readonly jsHost: IsolatedVmHost,
    private readonly pyHost: PyodideHost,
  ) {}

  async run(input: CodeSandboxInput): Promise<CodeSandboxResult> {
    const timeoutMs = Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const memoryLimitMb = input.memoryLimitMb ?? DEFAULT_MEMORY_MB;

    if (input.language === "javascript") {
      const r = await this.jsHost.run({ code: input.code, timeoutMs, memoryLimitMb });
      return {
        stdout: r.stdout,
        stderr: r.guestError ? `${r.stderr}\n${r.guestError}` : r.stderr,
        exitCode: r.exitCode,
        timedOut: r.timedOut,
        durationMs: r.durationMs,
        ...(r.truncated.stdout || r.truncated.stderr ? { truncated: r.truncated } : {}),
      };
    }

    // python
    const code = wrapPythonWithStdin(input.code, input.stdin);
    const r = await this.pyHost.runPython({ code, timeoutMs });
    return {
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.timedOut ? null : r.pythonError ? 1 : 0,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
    };
  }
}

/** Inject stdin as sys.stdin for the user's Python code. */
function wrapPythonWithStdin(userCode: string, stdin: string | undefined): string {
  if (!stdin) return userCode;
  const stdinJson = JSON.stringify(stdin);
  return `
import sys, io
sys.stdin = io.StringIO(${stdinJson})
${userCode}
`.trim();
}
