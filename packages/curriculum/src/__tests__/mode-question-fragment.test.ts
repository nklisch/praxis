/**
 * Integration tests: per-mode `questionToolFragment` registration.
 *
 * Verifies that:
 *  - every question-using mode registers the `question-tool-guidance` fragment
 *  - the composed system prompt contains the correct per-mode word caps
 *  - non-question-using modes (configure) do NOT include the fragment
 */
import { describe, expect, it } from "vitest";
import { composeSystemPromptWithAttribution } from "../brief/compose.js";
import { configureMode } from "../modes/configure.js";
import { courseCreateMode } from "../modes/course-create.js";
import { examMode } from "../modes/exam.js";
import { homeworkMode } from "../modes/homework.js";
import { quizMode } from "../modes/quiz.js";
import { studySkillsMode } from "../modes/study-skills.js";
import { teachMode } from "../modes/teach.js";
import { resolveQuestionConstraints } from "../question-constraints.js";

const FRAGMENT_ID = "question-tool-guidance";

// ── Fragment registration ─────────────────────────────────────────────────────

describe("question-tool-guidance fragment registration", () => {
  it("teach mode includes the fragment", () => {
    expect(teachMode.promptFragments.some((f) => f.id === FRAGMENT_ID)).toBe(true);
  });

  it("quiz mode includes the fragment", () => {
    expect(quizMode.promptFragments.some((f) => f.id === FRAGMENT_ID)).toBe(true);
  });

  it("homework mode includes the fragment", () => {
    expect(homeworkMode.promptFragments.some((f) => f.id === FRAGMENT_ID)).toBe(true);
  });

  it("exam mode includes the fragment", () => {
    expect(examMode.promptFragments.some((f) => f.id === FRAGMENT_ID)).toBe(true);
  });

  it("course-create mode includes the fragment", () => {
    expect(courseCreateMode.promptFragments.some((f) => f.id === FRAGMENT_ID)).toBe(true);
  });

  it("study-skills mode includes the fragment", () => {
    expect(studySkillsMode.promptFragments.some((f) => f.id === FRAGMENT_ID)).toBe(true);
  });

  it("configure mode does NOT include the fragment", () => {
    expect(configureMode.promptFragments.some((f) => f.id === FRAGMENT_ID)).toBe(false);
  });
});

// ── Fragment position ─────────────────────────────────────────────────────────

describe("question-tool-guidance fragment position", () => {
  it("teach: fragment sits at the constraints position", () => {
    const fragment = teachMode.promptFragments.find((f) => f.id === FRAGMENT_ID);
    expect(fragment?.position).toBe("constraints");
  });

  it("exam: fragment sits at the constraints position", () => {
    const fragment = examMode.promptFragments.find((f) => f.id === FRAGMENT_ID);
    expect(fragment?.position).toBe("constraints");
  });
});

// ── Composed system prompt content (per-mode caps) ───────────────────────────

describe("composeSystemPrompt — question-tool-guidance content", () => {
  it("teach: composed prompt contains teach promptMaxWords cap", () => {
    const { prompt } = composeSystemPromptWithAttribution({ mode: teachMode });
    const cap = resolveQuestionConstraints("teach").promptMaxWords;
    expect(prompt).toContain(`max ${cap} words`);
  });

  it("exam: composed prompt contains exam promptMaxWords cap", () => {
    const { prompt } = composeSystemPromptWithAttribution({ mode: examMode });
    const cap = resolveQuestionConstraints("exam").promptMaxWords;
    expect(prompt).toContain(`max ${cap} words`);
  });

  it("quiz: composed prompt contains quiz promptMaxWords cap", () => {
    const { prompt } = composeSystemPromptWithAttribution({ mode: quizMode });
    const cap = resolveQuestionConstraints("quiz").promptMaxWords;
    expect(prompt).toContain(`max ${cap} words`);
  });

  it("homework: composed prompt contains homework promptMaxWords cap", () => {
    const { prompt } = composeSystemPromptWithAttribution({ mode: homeworkMode });
    const cap = resolveQuestionConstraints("homework").promptMaxWords;
    expect(prompt).toContain(`max ${cap} words`);
  });

  it("study-skills: composed prompt contains study-skills promptMaxWords cap", () => {
    const { prompt } = composeSystemPromptWithAttribution({ mode: studySkillsMode });
    const cap = resolveQuestionConstraints("study-skills").promptMaxWords;
    expect(prompt).toContain(`max ${cap} words`);
  });

  it("course-create: composed prompt contains course-create promptMaxWords cap", () => {
    const { prompt } = composeSystemPromptWithAttribution({ mode: courseCreateMode });
    const cap = resolveQuestionConstraints("course-create").promptMaxWords;
    expect(prompt).toContain(`max ${cap} words`);
  });

  it("configure: composed prompt does NOT contain the question-tool-guidance header", () => {
    const { prompt } = composeSystemPromptWithAttribution({ mode: configureMode });
    expect(prompt).not.toContain("When using the question tools");
  });
});

// ── Per-mode cap differentiation ─────────────────────────────────────────────

describe("teach vs exam cap differentiation", () => {
  it("teach has stricter promptMaxWords than exam", () => {
    const teachCap = resolveQuestionConstraints("teach").promptMaxWords;
    const examCap = resolveQuestionConstraints("exam").promptMaxWords;
    // teach = 30, exam = 60 — teach is more constrained for inline formative checks
    expect(teachCap).toBeLessThan(examCap);
  });

  it("teach composed prompt contains 'max 30 words'", () => {
    const { prompt } = composeSystemPromptWithAttribution({ mode: teachMode });
    expect(prompt).toContain("max 30 words");
  });

  it("exam composed prompt contains 'max 60 words'", () => {
    const { prompt } = composeSystemPromptWithAttribution({ mode: examMode });
    expect(prompt).toContain("max 60 words");
  });
});

// ── Mode label in fragment template ──────────────────────────────────────────

describe("question-tool-guidance mode label", () => {
  it("teach fragment template references 'Teach mode'", () => {
    const fragment = teachMode.promptFragments.find((f) => f.id === FRAGMENT_ID);
    expect(fragment?.template).toContain("Teach mode");
  });

  it("exam fragment template references 'Exam mode'", () => {
    const fragment = examMode.promptFragments.find((f) => f.id === FRAGMENT_ID);
    expect(fragment?.template).toContain("Exam mode");
  });

  it("study-skills fragment template references 'Study Skills mode'", () => {
    const fragment = studySkillsMode.promptFragments.find((f) => f.id === FRAGMENT_ID);
    expect(fragment?.template).toContain("Study Skills mode");
  });
});
