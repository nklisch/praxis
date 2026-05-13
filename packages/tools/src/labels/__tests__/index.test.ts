import { describe, expect, it } from "vitest";
import { getToolLabel, TOOL_LABELS } from "../index.js";

describe("getToolLabel", () => {
  it("returns present and past for retrieve_from_documents", () => {
    const label = getToolLabel("retrieve_from_documents");
    expect(label.present).toBe("Looking up document references");
    expect(label.past).toBe("Cited document");
  });

  it("returns hidden: true for flashcard.review_next", () => {
    const label = getToolLabel("flashcard.review_next");
    expect(label.hidden).toBe(true);
  });

  it("falls back to humanized name for unknown tool", () => {
    const label = getToolLabel("future_unknown_tool");
    expect(label.present).toBe("Future unknown tool");
    expect(label.past).toBeUndefined();
    expect(label.hidden).toBeUndefined();
  });

  it("humanizes dotted tool names correctly", () => {
    // course.draft_add_unit IS in the registry; test the humanizer with an unknown tool
    // Humanizer: each dot-segment capitalizes its first word → "Some / Unknown tool"
    const unknown = getToolLabel("some.unknown_tool");
    expect(unknown.present).toBe("Some / Unknown tool");
  });

  it("returns hidden: true for quick_check tools", () => {
    for (const name of [
      "quick_check.confidence",
      "quick_check.matching",
      "quick_check.multi_select",
      "quick_check.short_answer",
      "quick_check.single_choice",
    ]) {
      expect(getToolLabel(name).hidden).toBe(true);
    }
  });

  it("returns hidden: true for assignment.show", () => {
    expect(getToolLabel("assignment.show").hidden).toBe(true);
  });

  it("returns hidden: true for clarification", () => {
    expect(getToolLabel("clarification").hidden).toBe(true);
  });

  it("has no emoji codepoints in any label value", () => {
    // Emoji range U+1F000-U+1FFFF (and related ranges)
    const emojiRegex = /[\u{1F000}-\u{1FFFF}]/u;
    for (const [name, label] of Object.entries(TOOL_LABELS)) {
      expect(label.present, `${name}.present should have no emoji`).not.toMatch(emojiRegex);
      if (label.past !== undefined) {
        expect(label.past, `${name}.past should have no emoji`).not.toMatch(emojiRegex);
      }
    }
  });

  it("has no raw tool names leaking into label values", () => {
    // Verify that tool names (with their internal separators) don't appear verbatim
    // in rendered values — e.g. "course.draft_add_unit" should not appear in a label
    for (const [name, label] of Object.entries(TOOL_LABELS)) {
      if (name.includes(".") || name.includes("_")) {
        expect(label.present, `${name}.present should not be raw tool name`).not.toBe(name);
        if (label.past !== undefined) {
          expect(label.past, `${name}.past should not be raw tool name`).not.toBe(name);
        }
      }
    }
  });

  it("grade_math has present and past", () => {
    const label = getToolLabel("grade_math");
    expect(label.present).toBe("Grading your work");
    expect(label.past).toBe("Graded");
  });

  it("code_sandbox has present and past", () => {
    const label = getToolLabel("code_sandbox");
    expect(label.present).toBe("Running code");
    expect(label.past).toBe("Ran code");
  });
});
