import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../index.js";

describe("@praxis/curriculum stub", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@praxis/curriculum");
  });
});
