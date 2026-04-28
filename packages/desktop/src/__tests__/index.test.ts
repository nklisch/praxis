import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../index.js";

describe("@praxis/desktop stub", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@praxis/desktop");
  });
});
