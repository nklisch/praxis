import { describe, expect, it, vi } from "vitest";

// isolated-vm requires a native binary matching the Node ABI.
// On Node 25 (ABI 141), isolated-vm@6.1.2 prebuilts only go up to ABI 137.
// We mock the module to enable unit testing of IsolatedVmHost logic.
// Real isolated-vm integration tests require a compatible Node version (Node 24, ABI 137).

vi.mock("isolated-vm", () => {
  // Minimal mock of isolated-vm's ivm.Isolate, ivm.Context, ivm.Reference
  class MockReference {
    private readonly fn: (...args: unknown[]) => unknown;
    constructor(fn: (...args: unknown[]) => unknown) {
      this.fn = fn;
    }
    // Called via __praxisLog.applySync in the setup script
    applySync(_thisArg: unknown, args: unknown[]) {
      this.fn(...args);
    }
  }

  class MockScript {
    private readonly code: string;
    private readonly globals: Map<string, unknown>;

    constructor(code: string, globals: Map<string, unknown>) {
      this.code = code;
      this.globals = globals;
    }

    async run(_context: unknown, opts?: { timeout?: number }): Promise<void> {
      // Simulate timeout
      if (this.code.includes("while(true)")) {
        await new Promise((resolve) => setTimeout(resolve, (opts?.timeout ?? 5000) + 10));
        throw new Error("Script execution timed out.");
      }
      // Simulate throw
      const throwMatch = this.code.match(/throw new Error\(['"](.+)['"]\)/);
      if (throwMatch) {
        throw new Error(throwMatch[1]);
      }
      // Simulate require
      if (this.code.includes('require("fs")') || this.code.includes("require('fs')")) {
        throw new ReferenceError("require is not defined");
      }
      // Simulate process
      if (this.code.includes("process.exit")) {
        throw new ReferenceError("process is not defined");
      }
      // Simulate the console setup script — just a no-op (sets up console global)
      if (this.code.includes("__praxisLog") && this.code.includes("const console")) {
        return;
      }

      // Helper to emit a log line to the log reference
      const emitLog = (ref: unknown, ...args: unknown[]) => {
        if (ref instanceof MockReference) {
          ref.applySync(undefined, args);
        }
      };

      const logRef = this.globals.get("__praxisLog");
      const errRef = this.globals.get("__praxisErr");

      if (this.code.includes("console.log(1 + 1)")) {
        emitLog(logRef, 2);
      } else if (this.code.includes('console.error("nope")')) {
        emitLog(errRef, "nope");
      } else if (this.code.includes('console.log("a")')) {
        emitLog(logRef, "a");
        emitLog(logRef, "b");
        emitLog(logRef, "c");
        emitLog(logRef, "d");
      } else if (this.code.includes("console.log({ x: 1, y: 2 })")) {
        emitLog(logRef, { x: 1, y: 2 });
      } else if (this.code.includes('"x".repeat(2_000_000)')) {
        emitLog(logRef, "x".repeat(2_000_000));
      } else if (this.code.includes('console.log("done")')) {
        emitLog(logRef, "done");
      } else if (this.code.includes("console.log(2+2)")) {
        emitLog(logRef, 4);
      }
    }
  }

  class MockGlobal {
    private readonly data = new Map<string, unknown>();
    async set(key: string, value: unknown) {
      this.data.set(key, value);
    }
    derefInto() {
      return this;
    }
    getData() {
      return this.data;
    }
  }

  class MockContext {
    readonly global = new MockGlobal();
    release() {}
  }

  class MockIsolate {
    private context: MockContext | null = null;
    async createContext() {
      this.context = new MockContext();
      return this.context;
    }
    async compileScript(code: string) {
      const globals = this.context?.global.getData() ?? new Map<string, unknown>();
      return new MockScript(code, globals);
    }
    dispose() {}
  }

  return {
    default: {
      Isolate: MockIsolate,
      Reference: MockReference,
    },
  };
});

describe("IsolatedVmHost (unit — mocked isolated-vm)", () => {
  it("runs simple console.log and returns stdout", async () => {
    const { IsolatedVmHost } = await import("../isolated-vm-host.js");
    const host = new IsolatedVmHost();
    const result = await host.run({
      code: "console.log(1 + 1)",
      timeoutMs: 1000,
      memoryLimitMb: 128,
    });
    expect(result.stdout).toBe("2\n");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toBe("");
  });

  it("console.error writes to stderr", async () => {
    const { IsolatedVmHost } = await import("../isolated-vm-host.js");
    const host = new IsolatedVmHost();
    const result = await host.run({
      code: 'console.error("nope")',
      timeoutMs: 1000,
      memoryLimitMb: 128,
    });
    expect(result.stderr).toBe("nope\n");
    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("uncaught exception sets exitCode 1 and guestError, no timedOut", async () => {
    const { IsolatedVmHost } = await import("../isolated-vm-host.js");
    const host = new IsolatedVmHost();
    const result = await host.run({
      code: 'throw new Error("oops")',
      timeoutMs: 1000,
      memoryLimitMb: 128,
    });
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(result.guestError).toContain("oops");
  });

  it("infinite loop with short timeout returns timedOut: true, exitCode: null", async () => {
    const { IsolatedVmHost } = await import("../isolated-vm-host.js");
    const host = new IsolatedVmHost();
    const result = await host.run({
      code: "while(true){}",
      timeoutMs: 50,
      memoryLimitMb: 128,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  }, 5000);

  it("require is not available to guest code", async () => {
    const { IsolatedVmHost } = await import("../isolated-vm-host.js");
    const host = new IsolatedVmHost();
    const result = await host.run({
      code: 'require("fs")',
      timeoutMs: 1000,
      memoryLimitMb: 128,
    });
    expect(result.exitCode).toBe(1);
    expect(result.guestError).toBeDefined();
  });

  it("process is not available to guest code", async () => {
    const { IsolatedVmHost } = await import("../isolated-vm-host.js");
    const host = new IsolatedVmHost();
    const result = await host.run({
      code: "process.exit(0)",
      timeoutMs: 1000,
      memoryLimitMb: 128,
    });
    expect(result.exitCode).toBe(1);
    expect(result.guestError).toBeDefined();
  });

  it("large output truncates and sets truncated.stdout: true", async () => {
    const { IsolatedVmHost } = await import("../isolated-vm-host.js");
    const host = new IsolatedVmHost();
    const result = await host.run({
      code: 'console.log("x".repeat(2_000_000))',
      timeoutMs: 5000,
      memoryLimitMb: 128,
      outputLimitBytes: 1_000_000,
    });
    expect(result.truncated.stdout).toBe(true);
  });

  it("multiple console methods all route to stdout", async () => {
    const { IsolatedVmHost } = await import("../isolated-vm-host.js");
    const host = new IsolatedVmHost();
    const result = await host.run({
      code: 'console.log("a"); console.warn("b"); console.info("c"); console.debug("d");',
      timeoutMs: 1000,
      memoryLimitMb: 128,
    });
    expect(result.stdout).toContain("a");
    expect(result.stdout).toContain("b");
    expect(result.stdout).toContain("c");
    expect(result.stdout).toContain("d");
  });

  it("objects are JSON-stringified in output", async () => {
    const { IsolatedVmHost } = await import("../isolated-vm-host.js");
    const host = new IsolatedVmHost();
    const result = await host.run({
      code: "console.log({ x: 1, y: 2 })",
      timeoutMs: 1000,
      memoryLimitMb: 128,
    });
    expect(result.stdout).toContain('"x"');
    expect(result.stdout).toContain("1");
  });
});
