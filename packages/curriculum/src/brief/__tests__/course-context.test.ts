/**
 * Unit tests for composeCourseContextFragment — Phase 6.
 *
 * Verifies that the produced PromptFragment contains the expected content
 * about the course title, current lesson, and concept tags.
 */
import type { CourseStateSnapshot } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { composeCourseContextFragment } from "../course-context.js";

const COURSE_ID = brandId<"CourseId">("course-1");
const LESSON_ID = brandId<"LessonId">("lesson-1");
const CONCEPT_ID_1 = brandId<"ConceptId">("concept-1");
const CONCEPT_ID_2 = brandId<"ConceptId">("concept-2");
const STUDENT_ID = brandId<"StudentId">("student-1");

function makeSnapshot(overrides: Partial<CourseStateSnapshot> = {}): CourseStateSnapshot {
  const course = {
    id: COURSE_ID,
    studentId: STUDENT_ID,
    title: "Algebra 1",
    subject: brandId<"SubjectId">("math"),
    gradeLevel: "9" as const,
    source: { kind: "bootstrapped" as const, sourceMaterials: [] },
    lessons: [],
    conceptGraphId: brandId<"ConceptGraphId">("graph-1"),
    gates: [],
    thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
  };
  const lesson = {
    id: LESSON_ID,
    courseId: COURSE_ID,
    title: "Intro to Variables",
    orderIndex: 0,
    conceptIds: [CONCEPT_ID_1, CONCEPT_ID_2],
    references: [],
    suggestedStrategy: brandId<"StrategyId">("worked-examples"),
    estimatedMinutes: 45,
  };
  const conceptsByLesson = new Map([
    [
      LESSON_ID,
      [
        {
          conceptId: CONCEPT_ID_1,
          name: "Variables",
          description: "Symbols for numbers",
          studied: true,
          lessonId: LESSON_ID,
        },
        {
          conceptId: CONCEPT_ID_2,
          name: "Equations",
          description: "Statements of equality",
          studied: false,
          lessonId: LESSON_ID,
        },
      ],
    ],
  ]);
  const conceptsById = new Map([
    [CONCEPT_ID_1, conceptsByLesson.get(LESSON_ID)![0]!],
    [CONCEPT_ID_2, conceptsByLesson.get(LESSON_ID)![1]!],
  ]);
  return {
    course,
    lessons: [lesson],
    currentLesson: lesson,
    conceptsByLesson,
    conceptsById,
    ...overrides,
  };
}

describe("composeCourseContextFragment", () => {
  it("returns a fragment with id context.course-state", () => {
    const snapshot = makeSnapshot();
    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.id).toBe("context.course-state");
    expect(fragment.customizable).toBe(true);
    expect(fragment.position).toBe("context");
  });

  it("includes the course title and subject in the template", () => {
    const snapshot = makeSnapshot();
    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).toContain("Algebra 1");
    expect(fragment.template).toContain("math");
  });

  it("includes the current lesson title when present", () => {
    const snapshot = makeSnapshot();
    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).toContain("Intro to Variables");
    expect(fragment.template).toContain("Current lesson:");
  });

  it("tags studied concepts as 'studied' and unstudied as 'not yet studied'", () => {
    const snapshot = makeSnapshot();
    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).toContain("Variables — studied");
    expect(fragment.template).toContain("Equations — not yet studied");
  });

  it("produces 'no in-progress lesson' message when currentLesson is null", () => {
    const snapshot = makeSnapshot({ currentLesson: null });
    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).not.toContain("Current lesson:");
    expect(fragment.template).toContain("no in-progress lesson");
  });

  it("includes references when the current lesson has them", () => {
    const lessonWithRef = {
      id: LESSON_ID,
      courseId: COURSE_ID,
      title: "Intro to Variables",
      orderIndex: 0,
      conceptIds: [CONCEPT_ID_1],
      references: [
        {
          kind: "textbook" as const,
          source: "Algebra Textbook",
          locator: { page: 12, section: "Chapter 1" },
        },
      ],
      suggestedStrategy: brandId<"StrategyId">("worked-examples"),
      estimatedMinutes: 45,
    };
    const snapshot = makeSnapshot({ currentLesson: lessonWithRef });
    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).toContain("Algebra Textbook");
    expect(fragment.template).toContain("p.12");
    expect(fragment.template).toContain("[Chapter 1]");
  });
});
