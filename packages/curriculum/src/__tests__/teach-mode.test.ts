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

  it("teachMode has all 8 prompt fragments (including tools + course-context + sketch-awareness)", () => {
    expect(teachMode.promptFragments).toHaveLength(8);
    const ids = teachMode.promptFragments.map((f) => f.id);
    const positions = teachMode.promptFragments.map((f) => f.position);
    expect(positions).toContain("preamble");
    expect(positions).toContain("role");
    expect(positions).toContain("principles");
    expect(positions).toContain("context"); // Phase 6: course-context fragment
    expect(positions).toContain("tools");
    expect(positions).toContain("constraints");
    expect(positions).toContain("postamble");
    expect(ids).toContain("sketch.awareness"); // Phase 15a
  });

  it("teachMode toolNames includes grade_math, code_sandbox and retrieve_from_textbook", () => {
    expect(teachMode.toolNames).toContain("grade_math");
    expect(teachMode.toolNames).toContain("code_sandbox");
    expect(teachMode.toolNames).toContain("retrieve_from_textbook");
  });

  it("teachMode toolNames includes Phase 7 active-path memory tools", () => {
    expect(teachMode.toolNames).toContain("update_mastery");
    expect(teachMode.toolNames).toContain("record_misconception");
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
