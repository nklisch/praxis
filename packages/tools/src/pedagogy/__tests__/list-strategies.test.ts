import { describe, expect, it } from "vitest";
import { pedagogyListStrategiesTool } from "../list-strategies.js";
import { makeCtx, makeEmptyPedagogyPackService, makeFilledPedagogyPackService } from "./helpers.js";

describe("pedagogy.list_strategies — filled pack", () => {
  const ctx = makeCtx(makeFilledPedagogyPackService());

  it("returns all strategies from the synthetic pack", async () => {
    const result = await pedagogyListStrategiesTool.handler({}, ctx);
    expect(result.strategies).toHaveLength(2);
    expect(result.strategies[0]?.id).toBe("worked-examples");
    expect(result.strategies[1]?.id).toBe("socratic");
  });

  it("includes applicability and promptFragment, excludes citations", async () => {
    const result = await pedagogyListStrategiesTool.handler({}, ctx);
    const first = result.strategies[0];
    expect(first?.applicability.cognitiveLoad).toBe("medium");
    expect(first?.promptFragment).toBeTruthy();
    // citations should not appear on the wire shape
    expect(first).not.toHaveProperty("citations");
  });
});

describe("pedagogy.list_strategies — empty pack", () => {
  const ctx = makeCtx(makeEmptyPedagogyPackService());

  it("returns empty strategies array", async () => {
    const result = await pedagogyListStrategiesTool.handler({}, ctx);
    expect(result.strategies).toEqual([]);
  });
});
