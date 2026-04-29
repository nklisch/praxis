/**
 * Minimal `isolated-vm` mock that lets `IsolatedVmHost` import without
 * triggering native binary load. Use in test files that import code which
 * transitively imports isolated-vm but never actually runs JS in a sandbox.
 * For tests that DO exercise IsolatedVmHost.run(), use the richer mock in
 * packages/tools/src/runtime/__tests__/isolated-vm-host.test.ts.
 *
 * Usage:
 *   import { isolatedVmStubFactory } from "./helpers/mocks.js";
 *   vi.mock("isolated-vm", isolatedVmStubFactory);
 */
export function isolatedVmStubFactory() {
  return {
    default: {
      Isolate: class {
        async createContext() {
          return {
            global: { set: async () => {}, derefInto: () => ({}) },
            release: () => {},
          };
        }
        async compileScript(_code: string) {
          return { run: async () => {} };
        }
        dispose() {}
      },
      Reference: class {
        // biome-ignore lint/suspicious/noExplicitAny: mock factory
        constructor(_fn: (...args: any[]) => unknown) {}
      },
    },
  };
}

/**
 * Quiet Logger that drops every call. Use when testing components that
 * accept a Logger but the test doesn't assert on log output.
 */
export function noopLogger(): import("@praxis/core/types").Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}
