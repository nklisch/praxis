/**
 * Unit tests for Phase 9 additions to composeCourseContextFragment:
 * bounded visibility window, lock tags on next lesson, and active gate section.
 */
import type { CourseStateSnapshot, GateView, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { composeCourseContextFragment } from "../course-context.js";

const COURSE_ID = brandId<"CourseId">("course-bounded");
const STUDENT_ID = brandId<"StudentId">("student-bounded");
const LESSON_A = brandId<"LessonId">("lesson-a");
const LESSON_B = brandId<"LessonId">("lesson-b");
const LESSON_C = brandId<"LessonId">("lesson-c");
const CONCEPT_1 = brandId<"ConceptId">("concept-1");

const NOW = 1_700_000_000_000 as Timestamp;

function makeCourse() {
  return {
    id: COURSE_ID,
    studentId: STUDENT_ID,
    title: "Bounded Course",
    subject: brandId<"SubjectId">("math"),
    gradeLevel: "9-12" as const,
    source: { kind: "bootstrapped" as const, sourceMaterials: [] },
    lessons: [],
    conceptGraphId: brandId<"ConceptGraphId">("graph-bounded"),
    gates: [],
    thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeLesson(id: typeof LESSON_A, title: string, conceptIds: (typeof CONCEPT_1)[] = []) {
  return {
    id,
    courseId: COURSE_ID,
    title,
    orderIndex: 0,
    conceptIds,
    references: [],
    suggestedStrategy: brandId<"StrategyId">("worked-examples"),
    estimatedMinutes: 30,
  };
}

function makeLockedGateView(lessonId: typeof LESSON_B, lockReason: string): GateView {
  return {
    gate: {
      id: brandId<"GateId">("gate-b"),
      courseId: COURSE_ID,
      guards: { kind: "lesson", lessonId },
      prerequisites: [],
      successCriteria: {
        kind: "mastery-threshold",
        conceptIds: [CONCEPT_1],
        minScore: 0.7,
      },
      state: { kind: "locked", missingPrerequisites: [] },
      evidence: [],
    },
    summaryText: "Master concept 1",
    lockReason,
    progress: 0.3,
    isActive: true,
  };
}

function makeSnapshot(overrides: Partial<CourseStateSnapshot>): CourseStateSnapshot {
  return {
    course: makeCourse(),
    lessons: [],
    currentLesson: null,
    conceptsByLesson: new Map(),
    conceptsById: new Map(),
    gates: [],
    activeGate: null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("composeCourseContextFragment — Phase 9 bounded visibility", () => {
  it("includes course-progress one-liner with correct counts", () => {
    const lessonA = makeLesson(LESSON_A, "Variables");
    const lessonB = makeLesson(LESSON_B, "Equations");
    const snapshot = makeSnapshot({
      lessons: [lessonA, lessonB],
      currentLesson: lessonA,
      visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    });

    const fragment = composeCourseContextFragment(snapshot);
    // 0 completed, 2 total, 1 ahead
    expect(fragment.template).toContain("Course progress: 0 of 2 lessons complete");
    expect(fragment.template).toContain("1 ahead");
  });

  it("includes 'Up next' line for the lesson after current", () => {
    const lessonA = makeLesson(LESSON_A, "Variables", [CONCEPT_1]);
    const lessonB = makeLesson(LESSON_B, "Equations", [CONCEPT_1]);
    const snapshot = makeSnapshot({
      lessons: [lessonA, lessonB],
      currentLesson: lessonA,
      visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    });

    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).toContain('Up next: "Equations"');
    expect(fragment.template).toContain("1 concept");
  });

  it("appends locked tag to 'Up next' when the next lesson's gate is locked", () => {
    const lessonA = makeLesson(LESSON_A, "Variables");
    const lessonB = makeLesson(LESSON_B, "Equations", [CONCEPT_1]);
    const gateView = makeLockedGateView(LESSON_B, "concept-1 below threshold");
    const snapshot = makeSnapshot({
      lessons: [lessonA, lessonB],
      currentLesson: lessonA,
      gates: [gateView],
      visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    });

    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).toContain("locked");
    expect(fragment.template).toContain("concept-1 below threshold");
  });

  it("does NOT append locked tag when the next lesson has no gate", () => {
    const lessonA = makeLesson(LESSON_A, "Variables");
    const lessonB = makeLesson(LESSON_B, "Equations");
    const snapshot = makeSnapshot({
      lessons: [lessonA, lessonB],
      currentLesson: lessonA,
      gates: [], // no gates
      visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    });

    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).not.toContain("locked");
    expect(fragment.template).toContain('Up next: "Equations"');
  });

  it("includes '(N more lessons follow.)' when remainingCount > 0", () => {
    const lessonA = makeLesson(LESSON_A, "Variables");
    const lessonB = makeLesson(LESSON_B, "Equations");
    const lessonC = makeLesson(LESSON_C, "Functions");
    const snapshot = makeSnapshot({
      lessons: [lessonA, lessonB, lessonC],
      currentLesson: lessonA,
      visibilityWindow: { currentLessonIndex: 0, remainingCount: 1 },
    });

    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).toContain("1 more lesson follow");
  });

  it("omits the 'more lessons' line when remainingCount is 0", () => {
    const lessonA = makeLesson(LESSON_A, "Variables");
    const snapshot = makeSnapshot({
      lessons: [lessonA],
      currentLesson: lessonA,
      visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    });

    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).not.toContain("more lesson");
  });

  it("includes active gate 'Working toward' section when activeGate is set", () => {
    const lessonA = makeLesson(LESSON_A, "Variables");
    const lessonB = makeLesson(LESSON_B, "Equations");
    const gateView = makeLockedGateView(LESSON_B, "concept-1 score: 0.35/0.70");
    gateView.isActive = true;
    const snapshot = makeSnapshot({
      lessons: [lessonA, lessonB],
      currentLesson: lessonA,
      gates: [gateView],
      activeGate: gateView,
      visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    });

    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).toContain("Working toward: unlock — Master concept 1");
    expect(fragment.template).toContain("Current status: concept-1 score: 0.35/0.70");
  });

  it("omits active gate section when activeGate is null", () => {
    const lessonA = makeLesson(LESSON_A, "Variables");
    const snapshot = makeSnapshot({
      lessons: [lessonA],
      currentLesson: lessonA,
      activeGate: null,
      visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    });

    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).not.toContain("Working toward");
  });
});
