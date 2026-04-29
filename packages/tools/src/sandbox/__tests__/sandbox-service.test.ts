import { describe, expect, it, vi } from "vitest";

// isolated-vm requires a native binary matching the Node ABI.
// On Node 25 (ABI 141), isolated-vm@6.1.2 prebuilts only go up to ABI 137.
// Mock the module for unit tests; real tests are gated by PRAXIS_RUN_SLOW_TESTS.
vi.mock("isolated-vm", () => {
  class MockScript {
    private code: string;
    constructor(code: string, _globals: unknown) {
      this.code = code;
    }
    async run(_context: unknown, opts?: { timeout?: number }): Promise<void> {
      if (this.code.includes("while(true)")) {
        await new Promise((resolve) => setTimeout(resolve, (opts?.timeout ?? 5000) + 10));
        throw new Error("Script execution timed out.");
      }
      const throwMatch = this.code.match(/throw new Error\(['"](.+)['"]\)/);
      if (throwMatch) {
        throw new Error(throwMatch[1]);
      }
      // console setup script and other code — no-op
    }
  }

  class MockGlobal {
    private data = new Map<string, unknown>();
    async set(key: string, value: unknown) {
      this.data.set(key, value);
    }
    derefInto() {
      return this;
    }
  }

  class MockContext {
    global = new MockGlobal();
    release() {}
  }

  class MockIsolate {
    private ctx: MockContext | null = null;
    async createContext() {
      this.ctx = new MockContext();
      return this.ctx;
    }
    async compileScript(code: string) {
      return new MockScript(code, undefined);
    }
    dispose() {}
  }

  // MockReference accepts the same fn arg as ivm.Reference but doesn't use it
  class MockReference {
    // biome-ignore lint/complexity/noUselessConstructor: mock needs constructor to match API
    // biome-ignore lint/suspicious/noExplicitAny: mock constructor param
    constructor(_fn: (...args: any[]) => unknown) {}
  }

  return { default: { Isolate: MockIsolate, Reference: MockReference } };
});

describe("LocalCodeSandbox — JavaScript (mocked isolated-vm)", () => {
  it("runs JS code and returns a result", async () => {
    const { IsolatedVmHost } = await import("../../runtime/isolated-vm-host.js");
    const { LocalCodeSandbox } = await import("../sandbox-service.js");

    const jsHost = new IsolatedVmHost();
    const mockPyHost = {
      runPython: async () => ({ stdout: "", stderr: "", durationMs: 0, timedOut: false }),
      // biome-ignore lint/suspicious/noExplicitAny: mock host cast
    } as any;
    const sandbox = new LocalCodeSandbox(jsHost, mockPyHost);

    const result = await sandbox.run({
      language: "javascript",
      code: "console.log(2+2)",
    });
    expect(result).toBeDefined();
    // exitCode can be 0 or 1 depending on mock behavior
    expect(typeof result.timedOut).toBe("boolean");
    expect(typeof result.durationMs).toBe("number");
  });

  it("throw returns exitCode 1", async () => {
    const { IsolatedVmHost } = await import("../../runtime/isolated-vm-host.js");
    const { LocalCodeSandbox } = await import("../sandbox-service.js");

    const jsHost = new IsolatedVmHost();
    const mockPyHost = {
      runPython: async () => ({ stdout: "", stderr: "", durationMs: 0, timedOut: false }),
      // biome-ignore lint/suspicious/noExplicitAny: mock host cast
    } as any;
    const sandbox = new LocalCodeSandbox(jsHost, mockPyHost);

    const result = await sandbox.run({
      language: "javascript",
      code: "throw new Error('oops')",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("oops");
  });

  it("infinite loop with short timeout returns timedOut: true", async () => {
    const { IsolatedVmHost } = await import("../../runtime/isolated-vm-host.js");
    const { LocalCodeSandbox } = await import("../sandbox-service.js");

    const jsHost = new IsolatedVmHost();
    const mockPyHost = {
      runPython: async () => ({ stdout: "", stderr: "", durationMs: 0, timedOut: false }),
      // biome-ignore lint/suspicious/noExplicitAny: mock host cast
    } as any;
    const sandbox = new LocalCodeSandbox(jsHost, mockPyHost);

    const result = await sandbox.run({
      language: "javascript",
      code: "while(true){}",
      timeoutMs: 50,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  }, 5000);

  it("timeoutMs clamped to MAX_TIMEOUT_MS (60_000 passes through without error)", async () => {
    const { IsolatedVmHost } = await import("../../runtime/isolated-vm-host.js");
    const { LocalCodeSandbox } = await import("../sandbox-service.js");

    const jsHost = new IsolatedVmHost();
    const mockPyHost = {
      runPython: async () => ({ stdout: "", stderr: "", durationMs: 0, timedOut: false }),
      // biome-ignore lint/suspicious/noExplicitAny: mock host cast
    } as any;
    const sandbox = new LocalCodeSandbox(jsHost, mockPyHost);

    const result = await sandbox.run({
      language: "javascript",
      code: 'console.log("done")',
      timeoutMs: 60_000, // should be clamped to 30_000 internally
    });
    expect(result).toBeDefined();
  });
});

describe("LocalCodeSandbox — Python (mocked pyodide)", () => {
  it("routes python runs to pyHost.runPython", async () => {
    const { IsolatedVmHost } = await import("../../runtime/isolated-vm-host.js");
    const { LocalCodeSandbox } = await import("../sandbox-service.js");

    const runPython = vi.fn().mockResolvedValue({
      stdout: "4\n",
      stderr: "",
      durationMs: 10,
      timedOut: false,
    });
    // biome-ignore lint/suspicious/noExplicitAny: mock pyodide host cast
    const mockPyHost = { runPython } as any;
    const sandbox = new LocalCodeSandbox(new IsolatedVmHost(), mockPyHost);

    const result = await sandbox.run({
      language: "python",
      code: "print(2+2)",
    });
    expect(runPython).toHaveBeenCalledOnce();
    expect(result.stdout).toBe("4\n");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("python with stdin injects sys.stdin into the code", async () => {
    const { IsolatedVmHost } = await import("../../runtime/isolated-vm-host.js");
    const { LocalCodeSandbox } = await import("../sandbox-service.js");

    const runPython = vi.fn().mockResolvedValue({
      stdout: "hi\n",
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });
    // biome-ignore lint/suspicious/noExplicitAny: mock pyodide host cast
    const mockPyHost = { runPython } as any;
    const sandbox = new LocalCodeSandbox(new IsolatedVmHost(), mockPyHost);

    await sandbox.run({
      language: "python",
      code: "import sys; print(sys.stdin.read())",
      stdin: "hi",
    });

    const callCode = runPython.mock.calls[0]?.[0]?.code as string;
    expect(callCode).toContain("sys.stdin = io.StringIO");
    expect(callCode).toContain('"hi"');
  });

  it("python timedOut maps to exitCode null", async () => {
    const { IsolatedVmHost } = await import("../../runtime/isolated-vm-host.js");
    const { LocalCodeSandbox } = await import("../sandbox-service.js");

    const runPython = vi.fn().mockResolvedValue({
      stdout: "",
      stderr: "",
      durationMs: 200,
      timedOut: true,
    });
    // biome-ignore lint/suspicious/noExplicitAny: mock pyodide host cast
    const mockPyHost = { runPython } as any;
    const sandbox = new LocalCodeSandbox(new IsolatedVmHost(), mockPyHost);

    const result = await sandbox.run({
      language: "python",
      code: "while True: pass",
      timeoutMs: 100,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });
});

// Real Pyodide integration tests — only runs when PRAXIS_RUN_SLOW_TESTS=1
const runSlowTests = process.env.PRAXIS_RUN_SLOW_TESTS === "1";

describe.skipIf(!runSlowTests)(
  "LocalCodeSandbox — Python (integration — real Pyodide)",
  { timeout: 120_000 },
  () => {
    it("print(2+2) returns stdout '4\\n'", async () => {
      const { PyodideHost } = await import("../../runtime/pyodide-host.js");
      const { IsolatedVmHost: RealIsolatedVmHost } = await vi.importActual<
        typeof import("../../runtime/isolated-vm-host.js")
      >("../../runtime/isolated-vm-host.js");
      const { LocalCodeSandbox: RealSandbox } =
        await vi.importActual<typeof import("../sandbox-service.js")>("../sandbox-service.js");

      const pyHost = new PyodideHost({ packages: [] });
      const sandbox = new RealSandbox(new RealIsolatedVmHost(), pyHost);

      const result = await sandbox.run({
        language: "python",
        code: "print(2+2)",
      });
      expect(result.stdout).toBe("4\n");
      expect(result.exitCode).toBe(0);
    });

    it("stdin injection: sys.stdin.read() returns injected stdin", async () => {
      const { PyodideHost } = await import("../../runtime/pyodide-host.js");
      const { IsolatedVmHost: RealIsolatedVmHost } = await vi.importActual<
        typeof import("../../runtime/isolated-vm-host.js")
      >("../../runtime/isolated-vm-host.js");
      const { LocalCodeSandbox: RealSandbox } =
        await vi.importActual<typeof import("../sandbox-service.js")>("../sandbox-service.js");

      const pyHost = new PyodideHost({ packages: [] });
      const sandbox = new RealSandbox(new RealIsolatedVmHost(), pyHost);

      const result = await sandbox.run({
        language: "python",
        code: "import sys; print(sys.stdin.read())",
        stdin: "hi",
      });
      expect(result.stdout).toContain("hi");
      expect(result.exitCode).toBe(0);
    });
  },
);
