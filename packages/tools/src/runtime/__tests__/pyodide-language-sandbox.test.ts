import { describe, expect, it } from "vitest";
import { PyodideHost } from "../pyodide-host.js";
import { PyodideLanguageSandbox } from "../pyodide-language-sandbox.js";

// Real Pyodide integration tests — only run when PRAXIS_RUN_SLOW_TESTS=1.
// Pyodide WASM boot takes ~3-5s on first load.
const runSlowTests = process.env.PRAXIS_RUN_SLOW_TESTS === "1";

describe.skipIf(!runSlowTests)(
  "PyodideLanguageSandbox",
  { timeout: 120_000 },
  () => {
    const host = new PyodideHost({ packages: [] });
    const sandbox = new PyodideLanguageSandbox(host);

    function run(
      code: string,
      overrides?: {
        timeoutMs?: number;
        memoryLimitMb?: number;
        stdin?: string;
      },
    ) {
      return sandbox.run({
        code,
        timeoutMs: overrides?.timeoutMs ?? 10_000,
        memoryLimitMb: overrides?.memoryLimitMb ?? 128,
        ...(overrides?.stdin !== undefined && { stdin: overrides.stdin }),
      });
    }

    it("hello world: print(2+2) produces '4\\n'", async () => {
      const r = await run("print(2+2)");
      expect(r.stdout).toBe("4\n");
      expect(r.exitCode).toBe(0);
      expect(r.timedOut).toBe(false);
    });

    it("division by zero: exitCode 1 and guestError contains ZeroDivisionError", async () => {
      const r = await run("1/0");
      expect(r.exitCode).toBe(1);
      expect(r.timedOut).toBe(false);
      expect(r.guestError).toBeDefined();
      expect(r.guestError).toContain("ZeroDivisionError");
    });

    it("stdin injection: sys.stdin.read() returns injected value", async () => {
      const r = await run("import sys; print(sys.stdin.read())", { stdin: "hi" });
      expect(r.stdout).toContain("hi");
      expect(r.exitCode).toBe(0);
    });

    it("memory limit passed through does not error", async () => {
      // memoryLimitMb is silently ignored by PyodideLanguageSandbox
      await expect(run("print('ok')", { memoryLimitMb: 64 })).resolves.not.toThrow();
    });

    it("durationMs is a positive number", async () => {
      const r = await run("1+1");
      expect(r.durationMs).toBeGreaterThan(0);
    });

    it("truncated is always { stdout: false, stderr: false }", async () => {
      const r = await run("print('hello')");
      expect(r.truncated).toEqual({ stdout: false, stderr: false });
    });
  },
);
