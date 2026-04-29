// isolated-vm requires a native binary matching the Node ABI.
// On Node 25 (ABI 141), isolated-vm@6.1.2 prebuilts only go up to ABI 137.
// index.ts re-exports IsolatedVmHost → isolated-vm, so we mock it here.
import { describe, expect, it, vi } from "vitest";

vi.mock("isolated-vm", () => ({
  default: {
    Isolate: class {
      // biome-ignore lint/complexity/noUselessConstructor: mock needs constructor to match API
      // biome-ignore lint/suspicious/noExplicitAny: mock constructor param
      constructor(_opts?: any) {}
      async createContext() {
        return { global: { set: async () => {}, derefInto: () => ({}) }, release: () => {} };
      }
      async compileScript(_code: string) {
        return { run: async () => {} };
      }
      dispose() {}
    },
    Reference: class {
      // biome-ignore lint/complexity/noUselessConstructor: mock needs constructor to match API
      // biome-ignore lint/suspicious/noExplicitAny: mock constructor param
      constructor(_fn: (...args: any[]) => unknown) {}
    },
  },
}));

import { PACKAGE_NAME } from "../index.js";

describe("@praxis/tools stub", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@praxis/tools");
  });
});
