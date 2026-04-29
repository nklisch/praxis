import { describe, expect, it } from "vitest";
import { mountPraxisApp } from "../index.js";

describe("@praxis/ui", () => {
  it("exports mountPraxisApp", () => {
    expect(typeof mountPraxisApp).toBe("function");
  });
});
