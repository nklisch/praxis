/**
 * Unit tests for metacognitivePromptsFragment factory.
 *
 * The factory is pure — same input always produces the same template.
 */
import { describe, expect, it } from "vitest";
import type { MetacognitivePromptTrigger } from "@praxis/core/types";
import {
  metacognitivePromptsFragment,
  type MetacognitivePromptsFragmentInput,
} from "../metacognitive-prompts.js";

const ALL_TRIGGERS: MetacognitivePromptTrigger[] = [
  "pre-reading",
  "post-reading",
  "pre-quiz",
  "post-error",
  "session-end",
];

describe("metacognitivePromptsFragment — shape", () => {
  it("returns id 'metacognitive-prompts'", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["pre-reading"] });
    expect(fragment.id).toBe("metacognitive-prompts");
  });

  it("returns position 'principles'", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["post-error"] });
    expect(fragment.position).toBe("principles");
  });

  it("returns customizable: false", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["session-end"] });
    expect(fragment.customizable).toBe(false);
  });

  it("template is a non-empty string", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["pre-quiz"] });
    expect(typeof fragment.template).toBe("string");
    expect(fragment.template.length).toBeGreaterThan(0);
  });
});

describe("metacognitivePromptsFragment — template content", () => {
  it("template instructs calling pedagogy.list_metacognitive_prompts", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["pre-reading"] });
    expect(fragment.template).toContain("pedagogy.list_metacognitive_prompts");
  });

  it("template instructs graceful fallback when list is empty", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["pre-reading"] });
    expect(fragment.template).toContain("empty list");
  });

  it("includes a bullet for 'pre-reading' when in triggers", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["pre-reading"] });
    expect(fragment.template).toContain("- **pre-reading** —");
  });

  it("includes a bullet for 'post-error' when in triggers", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["post-error"] });
    expect(fragment.template).toContain("- **post-error** —");
  });

  it("includes a bullet for 'pre-quiz' when in triggers", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["pre-quiz"] });
    expect(fragment.template).toContain("- **pre-quiz** —");
  });

  it("includes a bullet for 'post-reading' when in triggers", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["post-reading"] });
    expect(fragment.template).toContain("- **post-reading** —");
  });

  it("includes a bullet for 'session-end' when in triggers", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["session-end"] });
    expect(fragment.template).toContain("- **session-end** —");
  });

  it("does NOT include a bullet for a trigger not in the list", () => {
    const fragment = metacognitivePromptsFragment({ triggers: ["pre-reading"] });
    expect(fragment.template).not.toContain("- **post-error** —");
    expect(fragment.template).not.toContain("- **pre-quiz** —");
    expect(fragment.template).not.toContain("- **session-end** —");
    expect(fragment.template).not.toContain("- **post-reading** —");
  });
});

describe("metacognitivePromptsFragment — subset triggers", () => {
  it("only includes bullets for the requested triggers (teach set)", () => {
    const triggers: MetacognitivePromptTrigger[] = [
      "pre-reading",
      "post-error",
      "session-end",
    ];
    const fragment = metacognitivePromptsFragment({ triggers });
    expect(fragment.template).toContain("- **pre-reading** —");
    expect(fragment.template).toContain("- **post-error** —");
    expect(fragment.template).toContain("- **session-end** —");
    expect(fragment.template).not.toContain("- **pre-quiz** —");
    expect(fragment.template).not.toContain("- **post-reading** —");
  });

  it("only includes bullets for the requested triggers (quiz set)", () => {
    const triggers: MetacognitivePromptTrigger[] = ["pre-quiz", "post-error"];
    const fragment = metacognitivePromptsFragment({ triggers });
    expect(fragment.template).toContain("- **pre-quiz** —");
    expect(fragment.template).toContain("- **post-error** —");
    expect(fragment.template).not.toContain("- **pre-reading** —");
    expect(fragment.template).not.toContain("- **session-end** —");
  });
});

describe("metacognitivePromptsFragment — empty triggers", () => {
  it("still returns a valid fragment with empty trigger list", () => {
    const fragment = metacognitivePromptsFragment({ triggers: [] });
    expect(fragment.id).toBe("metacognitive-prompts");
    expect(fragment.position).toBe("principles");
    expect(fragment.customizable).toBe(false);
    expect(typeof fragment.template).toBe("string");
    expect(fragment.template.length).toBeGreaterThan(0);
  });

  it("template with empty triggers has no bullet lines", () => {
    const fragment = metacognitivePromptsFragment({ triggers: [] });
    expect(fragment.template).not.toContain("- **");
  });
});

describe("metacognitivePromptsFragment — purity", () => {
  it("same input always produces same template string", () => {
    const input: MetacognitivePromptsFragmentInput = {
      triggers: ["pre-reading", "post-error"],
    };
    const a = metacognitivePromptsFragment(input);
    const b = metacognitivePromptsFragment(input);
    expect(a.template).toBe(b.template);
    expect(a.id).toBe(b.id);
    expect(a.position).toBe(b.position);
    expect(a.customizable).toBe(b.customizable);
  });
});

describe("metacognitivePromptsFragment — round-trip all trigger values", () => {
  for (const trigger of ALL_TRIGGERS) {
    it(`does not throw for trigger '${trigger}'`, () => {
      expect(() =>
        metacognitivePromptsFragment({ triggers: [trigger] }),
      ).not.toThrow();
    });

    it(`includes bullet for trigger '${trigger}'`, () => {
      const fragment = metacognitivePromptsFragment({ triggers: [trigger] });
      expect(fragment.template).toContain(`- **${trigger}** —`);
    });
  }
});
