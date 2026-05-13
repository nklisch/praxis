import { describe, expect, it } from "vitest";
import { getMode, listModes, quizMode } from "../modes/index.js";

describe("quizMode", () => {
  it("getMode('quiz') returns the quiz mode", () => {
    const mode = getMode("quiz");
    expect(mode).toBeDefined();
    expect(mode?.id).toBe("quiz");
  });

  it("listModes includes quiz", () => {
    expect(listModes().some((m) => m.id === "quiz")).toBe(true);
  });

  it("quizMode has 10 prompt fragments including assignment-context, sketch-awareness, and metacognitive", () => {
    expect(quizMode.promptFragments).toHaveLength(10);
    const ids = quizMode.promptFragments.map((f) => f.id);
    expect(ids).toContain("context.assignment-state");
    expect(ids).toContain("context.course-state");
    expect(ids).toContain("tools.assessment");
    expect(ids).toContain("role.quiz");
    expect(ids).toContain("sketch.awareness"); // Phase 15a
  });

  it("quizMode toolNames includes assignment.show and assignment.read_grade", () => {
    expect(quizMode.toolNames).toContain("assignment.show");
    expect(quizMode.toolNames).toContain("assignment.read_grade");
  });

  it("quizMode toolNames includes retrieve_from_documents, update_mastery, record_misconception", () => {
    expect(quizMode.toolNames).toContain("retrieve_from_documents");
    expect(quizMode.toolNames).toContain("update_mastery");
    expect(quizMode.toolNames).toContain("record_misconception");
  });

  it("quizMode has uiSurface: 'chat'", () => {
    expect(quizMode.uiSurface).toBe("chat");
  });

  it("quizRoleFragment is customizable", () => {
    const role = quizMode.promptFragments.find((f) => f.id === "role.quiz");
    expect(role?.customizable).toBe(true);
  });

  it("assessmentToolsFragment is not customizable", () => {
    const tools = quizMode.promptFragments.find((f) => f.id === "tools.assessment");
    expect(tools?.customizable).toBe(false);
  });
});
