import { describe, expect, it } from "vitest";
import { pedagogyGetStrategyTool } from "../get-strategy.js";
import { makeCtx, makeEmptyPedagogyPackService, makeFilledPedagogyPackService } from "./helpers.js";

describe("pedagogy.get_strategy — filled pack", () => {
  const ctx = makeCtx(makeFilledPedagogyPackService());

  it("returns the strategy for a known id", async () => {
    const result = await pedagogyGetStrategyTool.handler({ id: "worked-examples" }, ctx);
    expect(result.kind).toBe("strategy");
    if (result.kind === "strategy") {
      expect(result.id).toBe("worked-examples");
      expect(result.name).toBe("Worked Examples");
      expect(result.applicability.cognitiveLoad).toBe("medium");
      expect(result).not.toHaveProperty("citations");
    }
  });

  it("returns not_found for an unknown id", async () => {
    const result = await pedagogyGetStrategyTool.handler({ id: "does-not-exist" }, ctx);
    expect(result.kind).toBe("not_found");
    if (result.kind === "not_found") {
      expect(result.id).toBe("does-not-exist");
    }
  });
});

describe("pedagogy.get_strategy — empty pack", () => {
  const ctx = makeCtx(makeEmptyPedagogyPackService());

  it("returns not_found when no pack is loaded", async () => {
    const result = await pedagogyGetStrategyTool.handler({ id: "worked-examples" }, ctx);
    expect(result.kind).toBe("not_found");
  });
});
