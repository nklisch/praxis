import { describe, expect, it } from "vitest";
import { questionToolFragment } from "../question-tool.js";

const teachCaps = {
  promptMaxWords: 30,
  choiceMaxWords: 10,
  choiceCount: 4,
  multiSelectCap: 4,
};
const examCaps = {
  promptMaxWords: 60,
  choiceMaxWords: 25,
  choiceCount: 5,
  multiSelectCap: 6,
};

describe("questionToolFragment", () => {
  it("returns a PromptFragment with the right id / position / customizable", () => {
    const fragment = questionToolFragment(teachCaps, "teach");
    expect(fragment.id).toBe("question-tool-guidance");
    expect(fragment.position).toBe("constraints");
    expect(fragment.customizable).toBe(false);
  });

  it("interpolates teach caps", () => {
    const fragment = questionToolFragment(teachCaps, "teach");
    expect(fragment.template).toContain("teach mode");
    expect(fragment.template).toContain("max 30 words");
    expect(fragment.template).toContain("max 10 words");
    expect(fragment.template).toContain("Up to 4 choices");
    expect(fragment.template).toContain("up to 4"); // multi-select cap
  });

  it("interpolates exam caps differently", () => {
    const fragment = questionToolFragment(examCaps, "exam");
    expect(fragment.template).toContain("exam mode");
    expect(fragment.template).toContain("max 60 words");
    expect(fragment.template).toContain("max 25 words");
  });

  it("includes all 6 markup-convention sections", () => {
    const fragment = questionToolFragment(teachCaps, "teach");
    expect(fragment.template).toContain("LaTeX");
    expect(fragment.template).toContain("citation");
    expect(fragment.template).toContain("[[def:");
    expect(fragment.template).toContain("GitHub admonition");
    expect(fragment.template).toContain("concept:");
    expect(fragment.template).toContain("::: figure");
  });
});
