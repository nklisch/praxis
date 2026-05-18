/**
 * Integration tests for metacognitive prompt fragment opt-ins across modes.
 *
 * Verifies that teach / quiz / homework / exam modes each include the
 * metacognitive fragment with the correct trigger sets, and have
 * pedagogy.list_metacognitive_prompts in their toolNames.
 *
 * Also verifies that study-skills, bootstrap, and configure modes do NOT
 * include the cross-mode metacognitive fragment (they have their own
 * metacognition surfaces or are non-student-facing).
 */

import type { PromptFragment } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { courseCreateMode } from "../course-create.js";
import { configureMode } from "../configure.js";
import { examMode } from "../exam.js";
import { homeworkMode } from "../homework.js";
import { quizMode } from "../quiz.js";
import { studySkillsMode } from "../study-skills.js";
import { teachMode } from "../teach.js";

const METACOGNITIVE_FRAGMENT_ID = "metacognitive-prompts";
const LIST_TOOL = "pedagogy.list_metacognitive_prompts";

function findMetacogFragment(fragments: PromptFragment[]): PromptFragment | undefined {
  return fragments.find((f) => f.id === METACOGNITIVE_FRAGMENT_ID);
}

// ---------------------------------------------------------------------------
// teach mode
// ---------------------------------------------------------------------------
describe("teach mode — metacognitive prompt opt-in", () => {
  it("has the metacognitive-prompts fragment in promptFragments", () => {
    const fragment = findMetacogFragment(teachMode.promptFragments);
    expect(fragment).toBeDefined();
  });

  it("metacognitive fragment position is 'principles'", () => {
    const fragment = findMetacogFragment(teachMode.promptFragments);
    expect(fragment?.position).toBe("principles");
  });

  it("metacognitive fragment is placed after principlesFragment", () => {
    const positions = teachMode.promptFragments.map((f) => f.id);
    const principlesIdx = positions.indexOf("principles.graded-grounding");
    const metacogIdx = positions.indexOf(METACOGNITIVE_FRAGMENT_ID);
    expect(principlesIdx).toBeGreaterThanOrEqual(0);
    expect(metacogIdx).toBeGreaterThan(principlesIdx);
  });

  it("metacognitive fragment template contains pre-reading trigger", () => {
    const fragment = findMetacogFragment(teachMode.promptFragments);
    expect(fragment?.template).toContain("- **pre-reading** —");
  });

  it("metacognitive fragment template contains post-error trigger", () => {
    const fragment = findMetacogFragment(teachMode.promptFragments);
    expect(fragment?.template).toContain("- **post-error** —");
  });

  it("metacognitive fragment template contains session-end trigger", () => {
    const fragment = findMetacogFragment(teachMode.promptFragments);
    expect(fragment?.template).toContain("- **session-end** —");
  });

  it("metacognitive fragment template does NOT contain pre-quiz trigger", () => {
    const fragment = findMetacogFragment(teachMode.promptFragments);
    expect(fragment?.template).not.toContain("- **pre-quiz** —");
  });

  it("toolNames includes pedagogy.list_metacognitive_prompts", () => {
    expect(teachMode.toolNames).toContain(LIST_TOOL);
  });
});

// ---------------------------------------------------------------------------
// quiz mode
// ---------------------------------------------------------------------------
describe("quiz mode — metacognitive prompt opt-in", () => {
  it("has the metacognitive-prompts fragment in promptFragments", () => {
    const fragment = findMetacogFragment(quizMode.promptFragments);
    expect(fragment).toBeDefined();
  });

  it("metacognitive fragment position is 'principles'", () => {
    const fragment = findMetacogFragment(quizMode.promptFragments);
    expect(fragment?.position).toBe("principles");
  });

  it("metacognitive fragment is placed after principlesFragment", () => {
    const positions = quizMode.promptFragments.map((f) => f.id);
    const principlesIdx = positions.indexOf("principles.graded-grounding");
    const metacogIdx = positions.indexOf(METACOGNITIVE_FRAGMENT_ID);
    expect(principlesIdx).toBeGreaterThanOrEqual(0);
    expect(metacogIdx).toBeGreaterThan(principlesIdx);
  });

  it("metacognitive fragment template contains pre-quiz trigger", () => {
    const fragment = findMetacogFragment(quizMode.promptFragments);
    expect(fragment?.template).toContain("- **pre-quiz** —");
  });

  it("metacognitive fragment template contains post-error trigger", () => {
    const fragment = findMetacogFragment(quizMode.promptFragments);
    expect(fragment?.template).toContain("- **post-error** —");
  });

  it("metacognitive fragment template does NOT contain pre-reading trigger", () => {
    const fragment = findMetacogFragment(quizMode.promptFragments);
    expect(fragment?.template).not.toContain("- **pre-reading** —");
  });

  it("metacognitive fragment template does NOT contain session-end trigger", () => {
    const fragment = findMetacogFragment(quizMode.promptFragments);
    expect(fragment?.template).not.toContain("- **session-end** —");
  });

  it("toolNames includes pedagogy.list_metacognitive_prompts", () => {
    expect(quizMode.toolNames).toContain(LIST_TOOL);
  });
});

// ---------------------------------------------------------------------------
// homework mode
// ---------------------------------------------------------------------------
describe("homework mode — metacognitive prompt opt-in", () => {
  it("has the metacognitive-prompts fragment in promptFragments", () => {
    const fragment = findMetacogFragment(homeworkMode.promptFragments);
    expect(fragment).toBeDefined();
  });

  it("metacognitive fragment position is 'principles'", () => {
    const fragment = findMetacogFragment(homeworkMode.promptFragments);
    expect(fragment?.position).toBe("principles");
  });

  it("metacognitive fragment is placed after principlesFragment", () => {
    const positions = homeworkMode.promptFragments.map((f) => f.id);
    const principlesIdx = positions.indexOf("principles.graded-grounding");
    const metacogIdx = positions.indexOf(METACOGNITIVE_FRAGMENT_ID);
    expect(principlesIdx).toBeGreaterThanOrEqual(0);
    expect(metacogIdx).toBeGreaterThan(principlesIdx);
  });

  it("metacognitive fragment template contains pre-reading trigger", () => {
    const fragment = findMetacogFragment(homeworkMode.promptFragments);
    expect(fragment?.template).toContain("- **pre-reading** —");
  });

  it("metacognitive fragment template contains post-error trigger", () => {
    const fragment = findMetacogFragment(homeworkMode.promptFragments);
    expect(fragment?.template).toContain("- **post-error** —");
  });

  it("metacognitive fragment template does NOT contain pre-quiz trigger", () => {
    const fragment = findMetacogFragment(homeworkMode.promptFragments);
    expect(fragment?.template).not.toContain("- **pre-quiz** —");
  });

  it("metacognitive fragment template does NOT contain session-end trigger", () => {
    const fragment = findMetacogFragment(homeworkMode.promptFragments);
    expect(fragment?.template).not.toContain("- **session-end** —");
  });

  it("toolNames includes pedagogy.list_metacognitive_prompts", () => {
    expect(homeworkMode.toolNames).toContain(LIST_TOOL);
  });
});

// ---------------------------------------------------------------------------
// exam mode
// ---------------------------------------------------------------------------
describe("exam mode — metacognitive prompt opt-in (session-end only)", () => {
  it("has the metacognitive-prompts fragment in promptFragments", () => {
    const fragment = findMetacogFragment(examMode.promptFragments);
    expect(fragment).toBeDefined();
  });

  it("metacognitive fragment position is 'principles'", () => {
    const fragment = findMetacogFragment(examMode.promptFragments);
    expect(fragment?.position).toBe("principles");
  });

  it("metacognitive fragment is placed after principlesFragment", () => {
    const positions = examMode.promptFragments.map((f) => f.id);
    const principlesIdx = positions.indexOf("principles.graded-grounding");
    const metacogIdx = positions.indexOf(METACOGNITIVE_FRAGMENT_ID);
    expect(principlesIdx).toBeGreaterThanOrEqual(0);
    expect(metacogIdx).toBeGreaterThan(principlesIdx);
  });

  it("metacognitive fragment template contains only session-end trigger", () => {
    const fragment = findMetacogFragment(examMode.promptFragments);
    expect(fragment?.template).toContain("- **session-end** —");
  });

  it("metacognitive fragment template does NOT contain post-error trigger (verification stance)", () => {
    const fragment = findMetacogFragment(examMode.promptFragments);
    expect(fragment?.template).not.toContain("- **post-error** —");
  });

  it("metacognitive fragment template does NOT contain pre-reading trigger", () => {
    const fragment = findMetacogFragment(examMode.promptFragments);
    expect(fragment?.template).not.toContain("- **pre-reading** —");
  });

  it("metacognitive fragment template does NOT contain pre-quiz trigger", () => {
    const fragment = findMetacogFragment(examMode.promptFragments);
    expect(fragment?.template).not.toContain("- **pre-quiz** —");
  });

  it("toolNames includes pedagogy.list_metacognitive_prompts", () => {
    expect(examMode.toolNames).toContain(LIST_TOOL);
  });

  it("exam mode still restricts to its minimal verification-stance tools", () => {
    // Exam mode must NOT include tools that reveal answer information.
    expect(examMode.toolNames).not.toContain("assignment.create");
    expect(examMode.toolNames).not.toContain("grade_math");
    expect(examMode.toolNames).not.toContain("retrieve_from_documents");
    expect(examMode.toolNames).not.toContain("update_mastery");
    expect(examMode.toolNames).not.toContain("record_misconception");
  });

  it("exam mode retains its original verification-stance tools", () => {
    expect(examMode.toolNames).toContain("assignment.show");
    expect(examMode.toolNames).toContain("assignment.read_grade");
    expect(examMode.toolNames).toContain("sketch.read");
    expect(examMode.toolNames).toContain("clarification");
  });
});

// ---------------------------------------------------------------------------
// Modes that must NOT carry the metacognitive-prompts fragment
// ---------------------------------------------------------------------------
describe("modes that must NOT carry the metacognitive-prompts fragment", () => {
  it.each([
    ["study-skills", studySkillsMode],
    ["course-create", courseCreateMode],
    ["configure", configureMode],
  ] as const)("%s mode has no metacognitive-prompts fragment", (_modeId, mode) => {
    expect(mode.promptFragments.find((f) => f.id === METACOGNITIVE_FRAGMENT_ID)).toBeUndefined();
  });
});
