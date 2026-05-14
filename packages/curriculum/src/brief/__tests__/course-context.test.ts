/**
 * Unit tests for composeCourseContextFragment — Phase 6.
 *
 * Verifies that the produced PromptFragment contains the expected content
 * about the course title, current lesson, and concept tags. The
 * course-aware mode-prompts foundation extended this composer with a third
 * `documents?` parameter — additional cases below verify that the documents
 * listing is byte-equivalent without docs, renders all 12 within the cap,
 * and tails with "…and N more documents" beyond.
 */
import type { CourseStateSnapshot, DocumentScopeAttachment, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { composeCourseContextFragment, formatMasteryTag } from "../course-context.js";

const COURSE_ID = brandId<"CourseId">("course-1");
const LESSON_ID = brandId<"LessonId">("lesson-1");
const CONCEPT_ID_1 = brandId<"ConceptId">("concept-1");
const CONCEPT_ID_2 = brandId<"ConceptId">("concept-2");
const STUDENT_ID = brandId<"StudentId">("student-1");

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
  const lessonRows = conceptsByLesson.get(LESSON_ID) ?? [];
  if (lessonRows.length < 2 || !lessonRows[0] || !lessonRows[1]) {
    throw new Error("test fixture must contain two concept rows");
  }
  const conceptsById = new Map([
    [CONCEPT_ID_1, lessonRows[0]],
    [CONCEPT_ID_2, lessonRows[1]],
  ]);
  return {
    course,
    lessons: [lesson],
    currentLesson: lesson,
    conceptsByLesson,
    conceptsById,
    gates: [],
    activeGate: null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    ...overrides,
  };
}

describe("formatMasteryTag", () => {
  it("returns 'mastered (0.xx)' when effectivePKnown >= 0.80", () => {
    expect(formatMasteryTag(0.85, true)).toBe("mastered (0.85)");
    expect(formatMasteryTag(0.8, true)).toBe("mastered (0.80)");
    expect(formatMasteryTag(1.0, false)).toBe("mastered (1.00)");
  });

  it("returns 'in progress (0.xx)' when effectivePKnown is 0.40–0.79", () => {
    expect(formatMasteryTag(0.55, false)).toBe("in progress (0.55)");
    expect(formatMasteryTag(0.4, false)).toBe("in progress (0.40)");
    expect(formatMasteryTag(0.79, true)).toBe("in progress (0.79)");
  });

  it("returns 'not yet started' when effectivePKnown < 0.40", () => {
    expect(formatMasteryTag(0.1, false)).toBe("not yet started");
    expect(formatMasteryTag(0.0, false)).toBe("not yet started");
    expect(formatMasteryTag(0.39, true)).toBe("not yet started");
  });

  it("falls back to studied/not-yet-studied when effectivePKnown is undefined", () => {
    expect(formatMasteryTag(undefined, true)).toBe("studied");
    expect(formatMasteryTag(undefined, false)).toBe("not yet studied");
  });
});

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

  it("shows graduated mastery tags when masteryByConceptId is provided", () => {
    const snapshot = makeSnapshot();
    const masteryByConceptId = new Map<string, number>([
      [CONCEPT_ID_1, 0.85], // mastered
      [CONCEPT_ID_2, 0.55], // in progress
    ]);
    const fragment = composeCourseContextFragment(snapshot, masteryByConceptId);
    expect(fragment.template).toContain("Variables — mastered (0.85)");
    expect(fragment.template).toContain("Equations — in progress (0.55)");
    // Should NOT contain the old binary tags
    expect(fragment.template).not.toContain("Variables — studied");
    expect(fragment.template).not.toContain("Equations — not yet studied");
  });

  it("falls back to binary studied/not-yet-studied when masteryByConceptId is absent", () => {
    const snapshot = makeSnapshot();
    const fragment = composeCourseContextFragment(snapshot);
    expect(fragment.template).toContain("Variables — studied");
    expect(fragment.template).toContain("Equations — not yet studied");
  });

  it("falls back to binary tags for concepts not in masteryByConceptId", () => {
    const snapshot = makeSnapshot();
    // Only provide mastery for concept-1; concept-2 should fall back to binary
    const masteryByConceptId = new Map<string, number>([[CONCEPT_ID_1, 0.9]]);
    const fragment = composeCourseContextFragment(snapshot, masteryByConceptId);
    expect(fragment.template).toContain("Variables — mastered (0.90)");
    expect(fragment.template).toContain("Equations — not yet studied");
  });
});

// ── Documents listing (course-aware mode-prompts foundation extension) ───────

function makeDocAttachment(i: number, chunkCount = 5): DocumentScopeAttachment {
  return {
    documentId: brandId<"DocumentId">(`doc-${i}`),
    filename: `material-${i}.pdf`,
    mimeType: "application/pdf",
    chunkCount,
    hasPageImages: false,
    source: "manual",
    attachedAt: new Date(0),
  };
}

describe("composeCourseContextFragment — documents parameter", () => {
  it("byte-equivalent to the previous signature when documents is undefined", () => {
    const snapshot = makeSnapshot();
    const withoutDocsArg = composeCourseContextFragment(snapshot, undefined);
    const withExplicitUndefined = composeCourseContextFragment(snapshot, undefined, undefined);
    expect(withExplicitUndefined.template).toBe(withoutDocsArg.template);
    // Sanity check: no documents header appears.
    expect(withExplicitUndefined.template).not.toContain("Available documents");
  });

  it("renders nothing when documents is an empty array", () => {
    const snapshot = makeSnapshot();
    const fragment = composeCourseContextFragment(snapshot, undefined, []);
    expect(fragment.template).not.toContain("Available documents");
  });

  it("lists all 12 documents inline when count == cap", () => {
    const snapshot = makeSnapshot();
    const docs = Array.from({ length: 12 }, (_, i) => makeDocAttachment(i + 1));
    const fragment = composeCourseContextFragment(snapshot, undefined, docs);
    expect(fragment.template).toContain("Available documents");
    for (const d of docs) {
      expect(fragment.template).toContain(d.filename);
    }
    expect(fragment.template).not.toContain("…and");
  });

  it("renders 12 + tail when count exceeds the 12-doc cap", () => {
    const snapshot = makeSnapshot();
    const docs = Array.from({ length: 13 }, (_, i) => makeDocAttachment(i + 1));
    const fragment = composeCourseContextFragment(snapshot, undefined, docs);
    // First 12 visible.
    for (let i = 1; i <= 12; i++) {
      expect(fragment.template).toContain(`material-${i}.pdf`);
    }
    // 13th replaced with the tail.
    expect(fragment.template).not.toContain("material-13.pdf");
    expect(fragment.template).toContain("…and 1 more documents");
  });

  it("includes per-document chunk counts in the listing", () => {
    const snapshot = makeSnapshot();
    const docs = [makeDocAttachment(1, 7)];
    const fragment = composeCourseContextFragment(snapshot, undefined, docs);
    expect(fragment.template).toContain("material-1.pdf (7 chunks)");
  });
});
