/**
 * Study-skills mode — Phase 18 registration and shape tests.
 *
 * Verifies that the study-skills mode is present in MODE_REGISTRY,
 * has the expected prompt fragments, and includes/excludes the right
 * tool names per the coaching-only scope.
 */
import { describe, expect, it } from "vitest";
import { getMode, listModes, requireMode } from "../index.js";
import { studySkillsMode } from "../study-skills.js";

describe("study-skills mode registration", () => {
  it("getMode('study-skills') returns the mode", () => {
    const mode = getMode("study-skills");
    expect(mode).toBeDefined();
    expect(mode?.id).toBe("study-skills");
  });

  it("requireMode('study-skills') does not throw", () => {
    expect(() => requireMode("study-skills")).not.toThrow();
  });

  it("requireMode('study-skills') returns the mode", () => {
    const mode = requireMode("study-skills");
    expect(mode.id).toBe("study-skills");
  });

  it("listModes includes study-skills", () => {
    const modes = listModes();
    expect(modes.some((m) => m.id === "study-skills")).toBe(true);
  });
});

describe("study-skills mode shape", () => {
  it("has the correct id, label, and requiredRole", () => {
    expect(studySkillsMode.id).toBe("study-skills");
    expect(studySkillsMode.label).toBe("Study Skills");
    expect(studySkillsMode.requiredRole).toBe("student");
  });

  it("has uiSurface 'chat'", () => {
    expect(studySkillsMode.uiSurface).toBe("chat");
  });

  it("has a description", () => {
    expect(studySkillsMode.description.length).toBeGreaterThan(0);
  });
});

describe("study-skills mode prompt fragments", () => {
  it("has 7 prompt fragments (preamble + role + principles + tools + course-context + constraints + postamble)", () => {
    expect(studySkillsMode.promptFragments).toHaveLength(7);
  });

  it("has a 'role' position fragment with id 'role.study-skills'", () => {
    const roleFragment = studySkillsMode.promptFragments.find((f) => f.position === "role");
    expect(roleFragment).toBeDefined();
    expect(roleFragment?.id).toBe("role.study-skills");
    expect(roleFragment?.customizable).toBe(true);
  });

  it("contains all expected positions", () => {
    const positions = studySkillsMode.promptFragments.map((f) => f.position);
    expect(positions).toContain("preamble");
    expect(positions).toContain("role");
    expect(positions).toContain("principles");
    expect(positions).toContain("tools");
    expect(positions).toContain("context");
    expect(positions).toContain("constraints");
    expect(positions).toContain("postamble");
  });

  it("role fragment template references the four-step coaching loop", () => {
    const roleFragment = studySkillsMode.promptFragments.find((f) => f.position === "role");
    expect(roleFragment?.template).toContain("Explain");
    expect(roleFragment?.template).toContain("Demonstrate");
    expect(roleFragment?.template).toContain("Practice");
    expect(roleFragment?.template).toContain("Reflect");
  });
});

describe("study-skills mode toolNames — included tools", () => {
  it("includes all 5 pedagogy pack tools", () => {
    const names = studySkillsMode.toolNames;
    expect(names).toContain("pedagogy.list_strategies");
    expect(names).toContain("pedagogy.get_strategy");
    expect(names).toContain("pedagogy.list_techniques");
    expect(names).toContain("pedagogy.get_technique");
    expect(names).toContain("pedagogy.list_metacognitive_prompts");
  });

  it("includes course.what_can_i_teach for concept-graph navigation", () => {
    expect(studySkillsMode.toolNames).toContain("course.what_can_i_teach");
  });

  it("includes all 5 note workspace tools", () => {
    const names = studySkillsMode.toolNames;
    expect(names).toContain("note.create");
    expect(names).toContain("note.update");
    expect(names).toContain("note.show");
    expect(names).toContain("note.list");
    expect(names).toContain("note.from_session_summary");
  });

  it("includes all 4 flashcard workspace tools", () => {
    const names = studySkillsMode.toolNames;
    expect(names).toContain("flashcard.create");
    expect(names).toContain("flashcard.from_note");
    expect(names).toContain("flashcard.review");
    expect(names).toContain("flashcard.review_next");
  });

  it("includes all 4 quick_check formative probe tools", () => {
    const names = studySkillsMode.toolNames;
    expect(names).toContain("quick_check.single_choice");
    expect(names).toContain("quick_check.multi_select");
    expect(names).toContain("quick_check.short_answer");
    expect(names).toContain("quick_check.confidence");
  });

  it("has exactly 19 tools", () => {
    // 5 pedagogy + 1 course nav + 5 note + 4 flashcard + 4 quick_check
    expect(studySkillsMode.toolNames).toHaveLength(19);
  });
});

describe("study-skills mode toolNames — excluded tools (coaching, not teaching/grading)", () => {
  it("does not include assignment.create", () => {
    expect(studySkillsMode.toolNames).not.toContain("assignment.create");
  });

  it("does not include grade_math", () => {
    expect(studySkillsMode.toolNames).not.toContain("grade_math");
  });

  it("does not include code_sandbox", () => {
    expect(studySkillsMode.toolNames).not.toContain("code_sandbox");
  });

  it("does not include retrieve_from_documents", () => {
    expect(studySkillsMode.toolNames).not.toContain("retrieve_from_documents");
  });

  it("does not include course.start_lesson", () => {
    expect(studySkillsMode.toolNames).not.toContain("course.start_lesson");
  });

  it("does not include course.current_concept", () => {
    expect(studySkillsMode.toolNames).not.toContain("course.current_concept");
  });

  it("does not include course.mark_studied", () => {
    expect(studySkillsMode.toolNames).not.toContain("course.mark_studied");
  });

  it("does not include update_mastery", () => {
    expect(studySkillsMode.toolNames).not.toContain("update_mastery");
  });

  it("does not include record_misconception", () => {
    expect(studySkillsMode.toolNames).not.toContain("record_misconception");
  });
});
