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

  it("teachMode has all 6 prompt fragments (including tools)", () => {
    expect(teachMode.promptFragments).toHaveLength(6);
    const positions = teachMode.promptFragments.map((f) => f.position);
    expect(positions).toContain("preamble");
    expect(positions).toContain("role");
    expect(positions).toContain("principles");
    expect(positions).toContain("tools");
    expect(positions).toContain("constraints");
    expect(positions).toContain("postamble");
  });

  it("teachMode toolNames includes grade_math, code_sandbox and retrieve_from_textbook", () => {
    expect(teachMode.toolNames).toContain("grade_math");
    expect(teachMode.toolNames).toContain("code_sandbox");
    expect(teachMode.toolNames).toContain("retrieve_from_textbook");
  });

  it("toolsFragment is between principles and constraints", () => {
    const positions = teachMode.promptFragments.map((f) => f.position);
    const principlesIdx = positions.indexOf("principles");
    const toolsIdx = positions.indexOf("tools");
    const constraintsIdx = positions.indexOf("constraints");
    expect(toolsIdx).toBeGreaterThan(principlesIdx);
    expect(toolsIdx).toBeLessThan(constraintsIdx);
  });

  it("principles fragment is not customizable", () => {
    const principles = teachMode.promptFragments.find(
      (f) => f.id === "principles.graded-grounding",
    );
    expect(principles?.customizable).toBe(false);
  });
});
