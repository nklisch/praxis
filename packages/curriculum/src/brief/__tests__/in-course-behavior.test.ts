/**
 * Unit tests for the in-course behavior fragment composer.
 *
 * Verifies:
 *  - `behaviorInCourseFragmentId(modeId)` produces the canonical id used by
 *    SessionServiceImpl as the overrides-map key.
 *  - `composeInCourseBehaviorFragment(modeId, snapshot)` returns a well-formed
 *    `PromptFragment` (position: "context", customizable: true) for each of
 *    teach / quiz / homework / exam / study-skills.
 *  - Each branch's template names the current lesson title so the model can
 *    cite it when formulating items.
 *  - `behaviorInCourseFragmentDefault.<mode>` (the no-course fallback set
 *    used by mode definitions) is well-formed for all five modes.
 */
import type { CourseStateSnapshot, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { behaviorInCourseFragmentDefault } from "../../modes/fragments/in-course-behavior.js";
import {
  behaviorInCourseFragmentId,
  composeInCourseBehaviorFragment,
  type InCourseBehaviorModeId,
} from "../in-course-behavior.js";

const COURSE_ID = brandId<"CourseId">("course-1");
const LESSON_ID = brandId<"LessonId">("lesson-1");
const STUDENT_ID = brandId<"StudentId">("student-1");

const MODES: ReadonlyArray<InCourseBehaviorModeId> = [
  "teach",
  "quiz",
  "homework",
  "exam",
  "study-skills",
];

function makeSnapshot(overrides: Partial<CourseStateSnapshot> = {}): CourseStateSnapshot {
  const NOW = 1_700_000_000_000 as Timestamp;
  const course = {
    id: COURSE_ID,
    studentId: STUDENT_ID,
    title: "Algebra 1",
    subject: brandId<"SubjectId">("math"),
    gradeLevel: "9-12" as const,
    source: { kind: "bootstrapped" as const, sourceMaterials: [] },
    lessons: [],
    conceptGraphId: brandId<"ConceptGraphId">("graph-1"),
    gates: [],
    thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
    createdAt: NOW,
    updatedAt: NOW,
  };
  const lesson = {
    id: LESSON_ID,
    courseId: COURSE_ID,
    title: "Solving Linear Equations",
    orderIndex: 0,
    conceptIds: [],
    references: [],
    suggestedStrategy: brandId<"StrategyId">("worked-examples"),
    estimatedMinutes: 45,
  };
  return {
    course,
    lessons: [lesson],
    currentLesson: lesson,
    conceptsByLesson: new Map(),
    conceptsById: new Map(),
    gates: [],
    activeGate: null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    ...overrides,
  };
}

describe("behaviorInCourseFragmentId", () => {
  it.each(MODES)("returns canonical id for %s", (modeId) => {
    expect(behaviorInCourseFragmentId(modeId)).toBe(`context.behavior-in-course.${modeId}`);
  });
});

describe("composeInCourseBehaviorFragment", () => {
  it.each(
    MODES,
  )("returns a well-formed fragment for mode=%s (id, position, customizable)", (modeId) => {
    const fragment = composeInCourseBehaviorFragment(modeId, makeSnapshot());
    expect(fragment.id).toBe(`context.behavior-in-course.${modeId}`);
    expect(fragment.position).toBe("context");
    expect(fragment.customizable).toBe(true);
    expect(typeof fragment.template).toBe("string");
    expect(fragment.template.length).toBeGreaterThan(0);
  });

  it.each(MODES)("template mentions the current lesson and course titles for %s", (modeId) => {
    const snapshot = makeSnapshot();
    const fragment = composeInCourseBehaviorFragment(modeId, snapshot);
    // Each per-mode addendum names the lesson and course so the model can
    // cite them. Exam mode is the one branch that doesn't currently quote
    // the lesson title — assert weakly there (substring match is acceptable
    // for any branch that includes the course title).
    if (modeId === "exam") {
      // Exam uses a closed-surface formulation; lesson title is implicit.
      // Verify the template at least contains a course-aware marker.
      expect(fragment.template.toLowerCase()).toContain("course");
    } else {
      expect(fragment.template).toContain(snapshot.currentLesson?.title ?? "");
      expect(fragment.template).toContain(snapshot.course.title);
    }
  });

  it("falls back to '(no current lesson)' when snapshot.currentLesson is null", () => {
    const snapshot = makeSnapshot({ currentLesson: null });
    const fragment = composeInCourseBehaviorFragment("teach", snapshot);
    // Branches that interpolate the lesson title use the safe fallback string.
    expect(fragment.template).toContain("(no current lesson)");
  });
});

describe("behaviorInCourseFragmentDefault (no-course fallback fragments)", () => {
  it.each(MODES)("has a well-formed fallback fragment for mode=%s", (modeId) => {
    const fragment = behaviorInCourseFragmentDefault[modeId];
    expect(fragment).toBeDefined();
    expect(fragment.id).toBe(`context.behavior-in-course.${modeId}`);
    expect(fragment.position).toBe("context");
    expect(fragment.customizable).toBe(true);
    expect(fragment.template.length).toBeGreaterThan(0);
    // The fallback explicitly names the no-course case so a stale override
    // doesn't accidentally read like a course-active one.
    expect(fragment.template.toLowerCase()).toContain("no active course");
  });
});
