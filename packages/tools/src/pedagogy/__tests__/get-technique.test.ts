import { describe, expect, it } from "vitest";
import { pedagogyGetTechniqueTool } from "../get-technique.js";
import { makeCtx, makeEmptyPedagogyPackService, makeFilledPedagogyPackService } from "./helpers.js";

describe("pedagogy.get_technique — filled pack", () => {
  const ctx = makeCtx(makeFilledPedagogyPackService());

  it("returns the technique with curriculum lessons for a known id", async () => {
    const result = await pedagogyGetTechniqueTool.handler({ id: "spaced-repetition" }, ctx);
    expect(result.kind).toBe("technique");
    if (result.kind === "technique") {
      expect(result.id).toBe("spaced-repetition");
      expect(result.name).toBe("Spaced Repetition");
      expect(result.curriculum.lessons).toHaveLength(1);
      expect(result.curriculum.lessons[0]?.id).toBe("sr-intro");
      expect(result).not.toHaveProperty("citations");
    }
  });

  it("returns not_found for an unknown id", async () => {
    const result = await pedagogyGetTechniqueTool.handler({ id: "no-such-technique" }, ctx);
    expect(result.kind).toBe("not_found");
    if (result.kind === "not_found") {
      expect(result.id).toBe("no-such-technique");
    }
  });
});

describe("pedagogy.get_technique — empty pack", () => {
  const ctx = makeCtx(makeEmptyPedagogyPackService());

  it("returns not_found when no pack is loaded", async () => {
    const result = await pedagogyGetTechniqueTool.handler({ id: "spaced-repetition" }, ctx);
    expect(result.kind).toBe("not_found");
  });
});
