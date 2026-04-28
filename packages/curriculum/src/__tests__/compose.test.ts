import { describe, expect, it } from "vitest";
import { composeBrief } from "../brief/compose.js";
import { preambleFragment } from "../modes/fragments/preamble.js";
import { principlesFragment } from "../modes/fragments/principles.js";
import { teachMode } from "../modes/index.js";

describe("composeBrief", () => {
  it("returns a Brief with all fragment templates joined in order", () => {
    const brief = composeBrief({ mode: teachMode, userMessage: "hi" });
    expect(brief.userMessage).toBe("hi");
    // All five templates should appear in the system prompt
    expect(brief.systemPrompt).toContain(preambleFragment.template);
    expect(brief.systemPrompt).toContain(principlesFragment.template);
    // preamble comes before principles in the output
    expect(brief.systemPrompt.indexOf(preambleFragment.template)).toBeLessThan(
      brief.systemPrompt.indexOf(principlesFragment.template),
    );
  });

  it("context defaults to empty arrays when not provided", () => {
    const brief = composeBrief({ mode: teachMode, userMessage: "hi" });
    expect(brief.context.retrievedChunks).toEqual([]);
    expect(brief.context.artifactRefs).toEqual([]);
  });

  it("applies customizable override correctly", () => {
    const overrides = new Map([["preamble.default", "Custom preamble text"]]);
    const brief = composeBrief({ mode: teachMode, userMessage: "hi", overrides });
    expect(brief.systemPrompt).toContain("Custom preamble text");
    expect(brief.systemPrompt).not.toContain(preambleFragment.template);
  });

  it("throws when overriding a non-customizable fragment", () => {
    const overrides = new Map([["principles.graded-grounding", "Bad override"]]);
    expect(() => composeBrief({ mode: teachMode, userMessage: "hi", overrides })).toThrow(
      `Fragment "principles.graded-grounding" is not customizable`,
    );
  });

  it("tolerates stale overrides for fragments that no longer exist", () => {
    const overrides = new Map([["stale.fragment.id", "value"]]);
    expect(() => composeBrief({ mode: teachMode, userMessage: "hi", overrides })).not.toThrow();
  });

  it("passes maxSteps and generation through", () => {
    const brief = composeBrief({
      mode: teachMode,
      userMessage: "hi",
      maxSteps: 5,
      generation: { temperature: 0.7, maxTokens: 1000 },
    });
    expect(brief.maxSteps).toBe(5);
    expect(brief.generation?.temperature).toBe(0.7);
  });
});
