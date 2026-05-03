import { describe, expect, it } from "vitest";
import { examMode, getMode, listModes } from "../modes/index.js";

describe("examMode", () => {
  it("getMode('exam') returns the exam mode", () => {
    const mode = getMode("exam");
    expect(mode).toBeDefined();
    expect(mode?.id).toBe("exam");
  });

  it("listModes includes exam", () => {
    expect(listModes().some((m) => m.id === "exam")).toBe(true);
  });

  it("examMode toolNames includes assignment.show, assignment.read_grade, and sketch.read", () => {
    expect(examMode.toolNames).toHaveLength(3);
    expect(examMode.toolNames).toContain("assignment.show");
    expect(examMode.toolNames).toContain("assignment.read_grade");
    expect(examMode.toolNames).toContain("sketch.read"); // Phase 15a
  });

  it("examMode does not include retrieve_from_textbook or mastery tools", () => {
    expect(examMode.toolNames).not.toContain("retrieve_from_textbook");
    expect(examMode.toolNames).not.toContain("update_mastery");
    expect(examMode.toolNames).not.toContain("record_misconception");
  });

  it("examRoleFragment is NOT customizable (verification stance)", () => {
    const role = examMode.promptFragments.find((f) => f.id === "role.exam");
    expect(role?.customizable).toBe(false);
  });

  it("examToolsFragment is NOT customizable", () => {
    const tools = examMode.promptFragments.find((f) => f.id === "tools.exam");
    expect(tools?.customizable).toBe(false);
  });

  it("examToolsFragment mentions rubric agent", () => {
    const tools = examMode.promptFragments.find((f) => f.id === "tools.exam");
    expect(tools?.template).toContain("rubric agent");
  });

  it("examMode has assignment-context fragment", () => {
    const ids = examMode.promptFragments.map((f) => f.id);
    expect(ids).toContain("context.assignment-state");
  });

  it("examMode has uiSurface: 'chat'", () => {
    expect(examMode.uiSurface).toBe("chat");
  });
});
