import { describe, expect, it } from "vitest";
import { questionToolFragment } from "../question-tool.js";

/** All 11 macro shortcuts mirrored from KATEX_MACRO_DOCS_INLINE */
const ALL_MACRO_SHORTCUTS = [
  "\\R",
  "\\Z",
  "\\N",
  "\\Q",
  "\\C",
  "\\pdv",
  "\\dv",
  "\\norm",
  "\\abs",
  "\\set",
  "\\given",
] as const;

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

  it("includes the LaTeX macros table header", () => {
    const fragment = questionToolFragment(teachCaps, "teach");
    expect(fragment.template).toContain("Available LaTeX macros");
    expect(fragment.template).toContain("| Shortcut | Expansion | Meaning |");
    expect(fragment.template).toContain("|---|---|---|");
  });

  it("includes all 11 macro shortcuts in the table", () => {
    const fragment = questionToolFragment(teachCaps, "teach");
    for (const shortcut of ALL_MACRO_SHORTCUTS) {
      expect(fragment.template).toContain(`\`${shortcut}\``);
    }
  });

  it("macros table is present regardless of mode caps", () => {
    const examFragment = questionToolFragment(examCaps, "exam");
    expect(examFragment.template).toContain("Available LaTeX macros");
    for (const shortcut of ALL_MACRO_SHORTCUTS) {
      expect(examFragment.template).toContain(`\`${shortcut}\``);
    }
  });
});
