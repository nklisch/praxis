import { describe, expect, it } from "vitest";
import { VISION_PROMPT } from "../vision-prompt.js";

describe("VISION_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof VISION_PROMPT).toBe("string");
    expect(VISION_PROMPT.length).toBeGreaterThan(100);
  });

  it("instructs markdown output with heading hierarchy", () => {
    expect(VISION_PROMPT).toContain("# / ## / ###");
    expect(VISION_PROMPT).toContain("Output as Markdown");
  });

  it("includes LaTeX math formatting rules", () => {
    expect(VISION_PROMPT).toContain("$$");
    expect(VISION_PROMPT).toContain("$ ... $");
  });

  it("includes figure placeholder format", () => {
    expect(VISION_PROMPT).toContain("![Figure:");
  });

  it("includes BLANK PAGE edge case", () => {
    expect(VISION_PROMPT).toContain("[BLANK PAGE]");
  });

  it("includes UNREADABLE edge case", () => {
    expect(VISION_PROMPT).toContain("[UNREADABLE]");
  });

  it("instructs suppressing noise (page numbers, headers, footers)", () => {
    expect(VISION_PROMPT).toContain("Page numbers");
    expect(VISION_PROMPT).toContain("Running headers and footers");
    expect(VISION_PROMPT).toContain("Watermarks");
  });

  it("matches snapshot", () => {
    expect(VISION_PROMPT).toMatchSnapshot();
  });
});
