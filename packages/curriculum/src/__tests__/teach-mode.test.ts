import { describe, expect, it } from "vitest";
import { getMode, listModes, requireMode, teachMode } from "../modes/index.js";

describe("mode registry", () => {
  it("getMode('teach') returns the teach mode", () => {
    const mode = getMode("teach");
    expect(mode).toBeDefined();
    expect(mode?.id).toBe("teach");
  });

  it("getMode('nonexistent') returns undefined", () => {
    expect(getMode("nonexistent")).toBeUndefined();
  });

  it("requireMode('nonexistent') throws", () => {
    expect(() => requireMode("nonexistent")).toThrow("Unknown mode: nonexistent");
  });

  it("listModes includes teach", () => {
    const modes = listModes();
    expect(modes.some((m) => m.id === "teach")).toBe(true);
  });

  it("teachMode has all 5 prompt fragments", () => {
    expect(teachMode.promptFragments).toHaveLength(5);
    const positions = teachMode.promptFragments.map((f) => f.position);
    expect(positions).toContain("preamble");
    expect(positions).toContain("role");
    expect(positions).toContain("principles");
    expect(positions).toContain("constraints");
    expect(positions).toContain("postamble");
  });

  it("principles fragment is not customizable", () => {
    const principles = teachMode.promptFragments.find(
      (f) => f.id === "principles.graded-grounding",
    );
    expect(principles?.customizable).toBe(false);
  });
});
