// isolated-vm requires a native binary matching the Node ABI.
// On Node 25 (ABI 141), isolated-vm@6.1.2 prebuilts only go up to ABI 137.
// index.ts re-exports IsolatedVmHost → isolated-vm, so we mock it here.
import { describe, expect, it, vi } from "vitest";

vi.mock("isolated-vm", async () => {
  const { isolatedVmStubFactory } = await import("../../../../tests/helpers/mocks.js");
  return isolatedVmStubFactory();
});

import { PACKAGE_NAME } from "../index.js";

describe("@praxis/tools stub", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@praxis/tools");
  });
});
