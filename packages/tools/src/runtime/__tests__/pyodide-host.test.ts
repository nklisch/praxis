import { beforeEach, describe, expect, it, vi } from "vitest";
import { PyodideHost, PyodideTimeoutError } from "../pyodide-host.js";

// Mock pyodide for unit tests — real pyodide load is integration-tested separately
vi.mock("pyodide", () => {
  const mockPy = {
    loadPackage: vi.fn().mockResolvedValue(undefined),
    runPythonAsync: vi.fn().mockResolvedValue(undefined),
    setStdout: vi.fn(),
    setStderr: vi.fn(),
  };
  return {
    loadPyodide: vi.fn().mockResolvedValue(mockPy),
  };
});

describe("PyodideHost (unit — mocked pyodide)", () => {
  it("does not load pyodide on construction", () => {
    const host = new PyodideHost();
    // @ts-expect-error accessing private for test assertion
    expect(host.instance).toBeNull();
    // @ts-expect-error accessing private for test assertion
    expect(host.loadPromise).toBeNull();
  });

  it("get() triggers load on first call and returns an instance", async () => {
    const host = new PyodideHost();
    const py = await host.get();
    expect(py).toBeDefined();
  });

  it("get() returns the same instance on subsequent calls (singleton)", async () => {
    const host = new PyodideHost();
    const py1 = await host.get();
    const py2 = await host.get();
    expect(py1).toBe(py2);
  });

  it("concurrent get() calls share the same load promise", async () => {
    const { loadPyodide } = await import("pyodide");
    const mockLoad = vi.mocked(loadPyodide);
    mockLoad.mockClear();

    const host = new PyodideHost();
    const [py1, py2, py3] = await Promise.all([host.get(), host.get(), host.get()]);
    expect(py1).toBe(py2);
    expect(py2).toBe(py3);
    // loadPyodide should have been called only once despite 3 concurrent gets
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it("preload() is equivalent to get()", async () => {
    const host = new PyodideHost();
    await host.preload();
    // @ts-expect-error accessing private for test assertion
    expect(host.instance).not.toBeNull();
  });
});

describe("PyodideTimeoutError", () => {
  it("has the correct name and message", () => {
    const err = new PyodideTimeoutError("timed out");
    expect(err.name).toBe("PyodideTimeoutError");
    expect(err.message).toBe("timed out");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("PyodideHost.runPython (unit — mocked pyodide)", () => {
  let mockRunPythonAsync: ReturnType<typeof vi.fn>;
  let mockSetStdout: ReturnType<typeof vi.fn>;
  let mockSetStderr: ReturnType<typeof vi.fn>;
  let host: PyodideHost;

  beforeEach(async () => {
    const { loadPyodide } = await import("pyodide");
    const mockLoad = vi.mocked(loadPyodide);
    mockRunPythonAsync = vi.fn().mockResolvedValue(undefined);
    mockSetStdout = vi.fn();
    mockSetStderr = vi.fn();
    mockLoad.mockResolvedValue({
      loadPackage: vi.fn().mockResolvedValue(undefined),
      runPythonAsync: mockRunPythonAsync,
      setStdout: mockSetStdout,
      setStderr: mockSetStderr,
      // biome-ignore lint/suspicious/noExplicitAny: mock factory needs any
    } as any);
    host = new PyodideHost();
  });

  it("resets stdout/stderr handlers after each call", async () => {
    await host.runPython({ code: "print('hi')", timeoutMs: 5000 });
    // Should call setStdout and setStderr twice: once to set, once to reset
    expect(mockSetStdout).toHaveBeenCalledTimes(2);
    expect(mockSetStderr).toHaveBeenCalledTimes(2);
    // Last call should reset to empty object
    expect(mockSetStdout).toHaveBeenLastCalledWith({});
    expect(mockSetStderr).toHaveBeenLastCalledWith({});
  });
});

// Real Pyodide integration test — only runs when PRAXIS_RUN_SLOW_TESTS=1
const runSlowTests = process.env.PRAXIS_RUN_SLOW_TESTS === "1";

describe.skipIf(!runSlowTests)(
  "PyodideHost (integration — real pyodide)",
  { timeout: 60_000 },
  () => {
    it("runs print(1+1) and returns stdout '2\\n'", async () => {
      // Re-import without mock
      const { PyodideHost: RealPyodideHost } =
        await vi.importActual<typeof import("../pyodide-host.js")>("../pyodide-host.js");
      const realHost = new RealPyodideHost({ packages: [] });
      const result = await realHost.runPython({ code: "print(1+1)", timeoutMs: 30_000 });
      expect(result.stdout).toBe("2\n");
      expect(result.timedOut).toBe(false);
    });
  },
);
