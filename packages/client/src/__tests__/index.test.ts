import { describe, expect, it } from "vitest";
import { createPraxisClient } from "../index.js";

describe("@praxis/client", () => {
  it("exports createPraxisClient", () => {
    expect(typeof createPraxisClient).toBe("function");
  });
});
