import { describe, expect, it } from "vitest";
import { pedagogyListTechniquesTool } from "../list-techniques.js";
import { makeCtx, makeEmptyPedagogyPackService, makeFilledPedagogyPackService } from "./helpers.js";

describe("pedagogy.list_techniques — filled pack", () => {
  const ctx = makeCtx(makeFilledPedagogyPackService());

  it("returns all techniques from the synthetic pack", async () => {
    const result = await pedagogyListTechniquesTool.handler({}, ctx);
    expect(result.techniques).toHaveLength(1);
    expect(result.techniques[0]?.id).toBe("spaced-repetition");
    expect(result.techniques[0]?.uiAffordances).toContain("flashcard-deck");
  });

  it("does not include curriculum lessons or citations in the list output", async () => {
    const result = await pedagogyListTechniquesTool.handler({}, ctx);
    const first = result.techniques[0];
    expect(first).not.toHaveProperty("curriculum");
    expect(first).not.toHaveProperty("citations");
  });
});

describe("pedagogy.list_techniques — empty pack", () => {
  const ctx = makeCtx(makeEmptyPedagogyPackService());

  it("returns empty techniques array", async () => {
    const result = await pedagogyListTechniquesTool.handler({}, ctx);
    expect(result.techniques).toEqual([]);
  });
});
