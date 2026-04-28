import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../index.js";

describe("@praxis/memory stub", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@praxis/memory");
  });
});
