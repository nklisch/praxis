import { describe, expect, it } from "vitest";
import { pedagogyListMetacognitivePromptsTool } from "../list-metacognitive-prompts.js";
import { makeCtx, makeEmptyPedagogyPackService, makeFilledPedagogyPackService } from "./helpers.js";

describe("pedagogy.list_metacognitive_prompts — filled pack", () => {
  const ctx = makeCtx(makeFilledPedagogyPackService());

  it("returns all prompts when no trigger filter is given", async () => {
    const result = await pedagogyListMetacognitivePromptsTool.handler({}, ctx);
    expect(result.prompts).toHaveLength(2);
  });

  it("filters by trigger when provided", async () => {
    const result = await pedagogyListMetacognitivePromptsTool.handler(
      { trigger: "pre-reading" },
      ctx,
    );
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]?.id).toBe("pre-reading-goals");
    expect(result.prompts[0]?.trigger).toBe("pre-reading");
  });

  it("returns empty for a trigger with no prompts in the pack", async () => {
    const result = await pedagogyListMetacognitivePromptsTool.handler(
      { trigger: "session-end" },
      ctx,
    );
    expect(result.prompts).toHaveLength(0);
  });

  it("includes id, trigger, and template on each prompt", async () => {
    const result = await pedagogyListMetacognitivePromptsTool.handler({}, ctx);
    const first = result.prompts[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("trigger");
    expect(first).toHaveProperty("template");
  });
});

describe("pedagogy.list_metacognitive_prompts — empty pack", () => {
  const ctx = makeCtx(makeEmptyPedagogyPackService());

  it("returns empty prompts array", async () => {
    const result = await pedagogyListMetacognitivePromptsTool.handler({}, ctx);
    expect(result.prompts).toEqual([]);
  });

  it("returns empty prompts array even with a trigger filter", async () => {
    const result = await pedagogyListMetacognitivePromptsTool.handler(
      { trigger: "post-error" },
      ctx,
    );
    expect(result.prompts).toEqual([]);
  });
});
