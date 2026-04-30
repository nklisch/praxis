import type {
  ConceptId,
  ConceptStateRow,
  Course,
  CourseId,
  CourseStateSnapshot,
  Lesson,
  LessonId,
  StudentId,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTER_CONFIG } from "../config.js";
import { suggestNext } from "../router.js";
import type { RouterInput } from "../types.js";

// ─── Test fixture helpers ─────────────────────────────────────────────────────

const STUDENT_ID = brandId<"StudentId">("student-1") as StudentId;
const COURSE_ID = brandId<"CourseId">("course-1") as CourseId;

function makeLesson(id: string, conceptIds: ConceptId[]): Lesson {
  return {
    id: brandId<"LessonId">(id) as LessonId,
    courseId: COURSE_ID,
    title: `Lesson ${id}`,
    conceptIds,
    references: [],
    suggestedStrategy: brandId("explain-examples"),
    estimatedMinutes: 30,
  };
}

function makeConcept(
  id: string,
  lessonId: string,
  opts: { studied?: boolean; studiedAt?: Timestamp } = {},
): ConceptStateRow {
  const base: ConceptStateRow = {
    conceptId: brandId<"ConceptId">(id) as ConceptId,
    name: `Concept ${id}`,
    description: `Description of ${id}`,
    studied: opts.studied ?? false,
    lessonId: brandId<"LessonId">(lessonId) as LessonId,
  };
  if (opts.studiedAt !== undefined) {
    base.studiedAt = opts.studiedAt;
  }
  return base;
}

function makeCourse(): Course {
  return {
    id: COURSE_ID,
    studentId: STUDENT_ID,
    title: "Test Course",
    subject: brandId("math"),
    gradeLevel: "9-12",
    source: { kind: "authored", authorRole: "self-directed" },
    lessons: [],
    conceptGraphId: brandId("graph-1"),
    gates: [],
    thresholds: { conceptMastery: 0.8, examPass: 0.7, allowRetake: true, decayDays: 30 },
    createdAt: 1000 as Timestamp,
    updatedAt: 1000 as Timestamp,
  };
}

function makeSnapshot(
  lessons: Lesson[],
  conceptsByLesson: Map<LessonId, ConceptStateRow[]>,
  currentLesson: Lesson | null,
): CourseStateSnapshot {
  return {
    course: makeCourse(),
    lessons,
    currentLesson,
    conceptsByLesson,
    conceptsById: new Map(
      Array.from(conceptsByLesson.values())
        .flat()
        .map((c) => [c.conceptId, c]),
    ),
    gates: [],
    activeGate: null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
  };
}

function makeInput(
  snapshot: CourseStateSnapshot,
  opts: {
    masteryByConceptId?: Map<string, number>;
    uncertaintyByConceptId?: Map<string, number>;
    lastPracticedByConceptId?: Map<string, Timestamp>;
    now?: Timestamp;
  } = {},
): RouterInput {
  return {
    snapshot,
    masteryByConceptId: opts.masteryByConceptId ?? new Map(),
    uncertaintyByConceptId: opts.uncertaintyByConceptId ?? new Map(),
    lastPracticedByConceptId: opts.lastPracticedByConceptId ?? new Map(),
    now: opts.now ?? (Date.now() as Timestamp),
    decayDays: 30,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("suggestNext", () => {
  describe("no current lesson", () => {
    it("returns null primary when currentLesson is null", () => {
      const lessons: Lesson[] = [];
      const snapshot = makeSnapshot(lessons, new Map(), null);
      const result = suggestNext(makeInput(snapshot));
      expect(result.primary).toBeNull();
      expect(result.reviews).toHaveLength(0);
      expect(result.interleaves).toHaveLength(0);
    });
  });

  describe("early course state (lesson 1, no mastery)", () => {
    it("returns first un-studied concept with reason next-in-order", () => {
      const lesson1Id = brandId<"LessonId">("l1") as LessonId;
      const cA = makeConcept("c-a", "l1");
      const cB = makeConcept("c-b", "l1");
      const lesson1 = makeLesson("l1", [cA.conceptId, cB.conceptId]);

      const conceptsByLesson = new Map([[lesson1Id, [cA, cB]]]);
      const snapshot = makeSnapshot([lesson1], conceptsByLesson, lesson1);

      const result = suggestNext(makeInput(snapshot));

      expect(result.primary?.conceptId).toBe("c-a");
      expect(result.primary?.reason).toBe("next-in-order");
      expect(result.reviews).toHaveLength(0);
      expect(result.interleaves).toHaveLength(0);
    });
  });

  describe("frontier: all studied but not all mastered", () => {
    it("picks highest uncertainty concept with reason frontier", () => {
      const lesson1Id = brandId<"LessonId">("l1") as LessonId;
      const now = 1_000_000_000 as Timestamp;
      const cA = makeConcept("c-a", "l1", { studied: true, studiedAt: now });
      const cB = makeConcept("c-b", "l1", { studied: true, studiedAt: now });
      const lesson1 = makeLesson("l1", [cA.conceptId, cB.conceptId]);

      const conceptsByLesson = new Map([[lesson1Id, [cA, cB]]]);
      const snapshot = makeSnapshot([lesson1], conceptsByLesson, lesson1);

      // c-b has higher uncertainty (more uncertain = frontier priority)
      const masteryByConceptId = new Map([
        ["c-a", 0.6],
        ["c-b", 0.4],
      ]);
      const uncertaintyByConceptId = new Map([
        ["c-a", 0.2],
        ["c-b", 0.8], // higher uncertainty
      ]);

      const result = suggestNext(
        makeInput(snapshot, { masteryByConceptId, uncertaintyByConceptId, now }),
      );

      expect(result.primary?.conceptId).toBe("c-b");
      expect(result.primary?.reason).toBe("frontier");
    });
  });

  describe("reviews: earlier-lesson concept with decayed mastery", () => {
    it("includes concept with mastery below reviewThreshold in reviews", () => {
      const lesson1Id = brandId<"LessonId">("l1") as LessonId;
      const lesson2Id = brandId<"LessonId">("l2") as LessonId;
      const now = 1_000_000_000 as Timestamp;

      const cOld = makeConcept("c-old", "l1", { studied: true, studiedAt: now });
      const cNew = makeConcept("c-new", "l2");
      const lesson1 = makeLesson("l1", [cOld.conceptId]);
      const lesson2 = makeLesson("l2", [cNew.conceptId]);

      const conceptsByLesson = new Map([
        [lesson1Id, [cOld]],
        [lesson2Id, [cNew]],
      ]);
      const snapshot = makeSnapshot([lesson1, lesson2], conceptsByLesson, lesson2);

      // c-old has low mastery (below default reviewThreshold of 0.5)
      const masteryByConceptId = new Map([["c-old", 0.3]]);

      const result = suggestNext(makeInput(snapshot, { masteryByConceptId, now }));

      expect(result.primary?.conceptId).toBe("c-new"); // un-studied in current lesson
      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0]?.conceptId).toBe("c-old");
      expect(result.reviews[0]?.reason).toBe("review");
    });

    it("does not include un-studied earlier-lesson concepts in reviews", () => {
      const lesson1Id = brandId<"LessonId">("l1") as LessonId;
      const lesson2Id = brandId<"LessonId">("l2") as LessonId;

      // c-old never studied (studied=false), mastery=0
      const cOld = makeConcept("c-old", "l1", { studied: false });
      const cNew = makeConcept("c-new", "l2");
      const lesson1 = makeLesson("l1", [cOld.conceptId]);
      const lesson2 = makeLesson("l2", [cNew.conceptId]);

      const conceptsByLesson = new Map([
        [lesson1Id, [cOld]],
        [lesson2Id, [cNew]],
      ]);
      const snapshot = makeSnapshot([lesson1, lesson2], conceptsByLesson, lesson2);
      const masteryByConceptId = new Map([["c-old", 0.0]]);

      const result = suggestNext(makeInput(snapshot, { masteryByConceptId }));

      // c-old not studied, so not eligible for review
      expect(result.reviews).toHaveLength(0);
    });
  });

  describe("interleaves: earlier-lesson concept at high mastery, practiced long ago", () => {
    it("includes concept due for interleaving", () => {
      const lesson1Id = brandId<"LessonId">("l1") as LessonId;
      const lesson2Id = brandId<"LessonId">("l2") as LessonId;

      const DAY_MS = 1000 * 60 * 60 * 24;
      const now = (DAY_MS * 100) as Timestamp; // day 100
      const lastPracticed = (DAY_MS * 90) as Timestamp; // 10 days ago (> 5-day threshold)

      const cOld = makeConcept("c-strong", "l1", {
        studied: true,
        studiedAt: (DAY_MS * 88) as Timestamp,
      });
      const cNew = makeConcept("c-new", "l2");
      const lesson1 = makeLesson("l1", [cOld.conceptId]);
      const lesson2 = makeLesson("l2", [cNew.conceptId]);

      const conceptsByLesson = new Map([
        [lesson1Id, [cOld]],
        [lesson2Id, [cNew]],
      ]);
      const snapshot = makeSnapshot([lesson1, lesson2], conceptsByLesson, lesson2);

      // High mastery, practiced 10 days ago
      const masteryByConceptId = new Map([["c-strong", 0.9]]);
      const lastPracticedByConceptId = new Map([["c-strong", lastPracticed]]);

      const result = suggestNext(
        makeInput(snapshot, { masteryByConceptId, lastPracticedByConceptId, now }),
      );

      expect(result.interleaves).toHaveLength(1);
      expect(result.interleaves[0]?.conceptId).toBe("c-strong");
      expect(result.interleaves[0]?.reason).toBe("interleave");
    });

    it("does not include recently-practiced concept in interleaves", () => {
      const lesson1Id = brandId<"LessonId">("l1") as LessonId;
      const lesson2Id = brandId<"LessonId">("l2") as LessonId;

      const DAY_MS = 1000 * 60 * 60 * 24;
      const now = (DAY_MS * 100) as Timestamp;
      const lastPracticed = (DAY_MS * 99) as Timestamp; // 1 day ago (< 5-day threshold)

      const cOld = makeConcept("c-recent", "l1", { studied: true });
      const cNew = makeConcept("c-new", "l2");
      const lesson1 = makeLesson("l1", [cOld.conceptId]);
      const lesson2 = makeLesson("l2", [cNew.conceptId]);

      const conceptsByLesson = new Map([
        [lesson1Id, [cOld]],
        [lesson2Id, [cNew]],
      ]);
      const snapshot = makeSnapshot([lesson1, lesson2], conceptsByLesson, lesson2);

      const masteryByConceptId = new Map([["c-recent", 0.9]]);
      const lastPracticedByConceptId = new Map([["c-recent", lastPracticed]]);

      const result = suggestNext(
        makeInput(snapshot, { masteryByConceptId, lastPracticedByConceptId, now }),
      );

      expect(result.interleaves).toHaveLength(0);
    });
  });

  describe("reviews and interleaves are mutually exclusive", () => {
    it("a concept chosen as review does not appear in interleaves", () => {
      const lesson1Id = brandId<"LessonId">("l1") as LessonId;
      const lesson2Id = brandId<"LessonId">("l2") as LessonId;

      const DAY_MS = 1000 * 60 * 60 * 24;
      const now = (DAY_MS * 100) as Timestamp;
      const lastPracticed = (DAY_MS * 90) as Timestamp; // 10 days ago

      // This concept has low mastery (review candidate) AND was practiced long ago.
      // It should only appear in reviews, not both.
      const cAmbiguous = makeConcept("c-ambiguous", "l1", { studied: true });
      const cNew = makeConcept("c-new", "l2");
      const lesson1 = makeLesson("l1", [cAmbiguous.conceptId]);
      const lesson2 = makeLesson("l2", [cNew.conceptId]);

      const conceptsByLesson = new Map([
        [lesson1Id, [cAmbiguous]],
        [lesson2Id, [cNew]],
      ]);
      const snapshot = makeSnapshot([lesson1, lesson2], conceptsByLesson, lesson2);

      // Low mastery → review; but high enough that interleaveMinMastery is NOT met
      const masteryByConceptId = new Map([["c-ambiguous", 0.3]]); // below reviewThreshold
      const lastPracticedByConceptId = new Map([["c-ambiguous", lastPracticed]]);

      const result = suggestNext(
        makeInput(snapshot, { masteryByConceptId, lastPracticedByConceptId, now }),
      );

      const reviewIds = new Set(result.reviews.map((r) => r.conceptId));
      const interleaveIds = new Set(result.interleaves.map((i) => i.conceptId));
      // No overlap
      for (const id of reviewIds) {
        expect(interleaveIds.has(id)).toBe(false);
      }
    });
  });

  describe("all-complete: course fully mastered", () => {
    it("returns null primary when all current-lesson concepts are mastered", () => {
      const lesson1Id = brandId<"LessonId">("l1") as LessonId;
      const now = 1_000_000 as Timestamp;

      const cA = makeConcept("c-a", "l1", { studied: true, studiedAt: now });
      const lesson1 = makeLesson("l1", [cA.conceptId]);

      const conceptsByLesson = new Map([[lesson1Id, [cA]]]);
      const snapshot = makeSnapshot([lesson1], conceptsByLesson, lesson1);

      // Above masteredThreshold
      const masteryByConceptId = new Map([["c-a", 0.9]]);

      const result = suggestNext(makeInput(snapshot, { masteryByConceptId, now }));

      expect(result.primary).toBeNull();
      expect(result.reviews).toHaveLength(0);
      expect(result.interleaves).toHaveLength(0);
    });
  });

  describe("config overrides", () => {
    it("respects custom reviewThreshold", () => {
      const lesson1Id = brandId<"LessonId">("l1") as LessonId;
      const lesson2Id = brandId<"LessonId">("l2") as LessonId;
      const now = 1_000_000 as Timestamp;

      const cOld = makeConcept("c-old", "l1", { studied: true, studiedAt: now });
      const cNew = makeConcept("c-new", "l2");
      const lesson1 = makeLesson("l1", [cOld.conceptId]);
      const lesson2 = makeLesson("l2", [cNew.conceptId]);

      const conceptsByLesson = new Map([
        [lesson1Id, [cOld]],
        [lesson2Id, [cNew]],
      ]);
      const snapshot = makeSnapshot([lesson1, lesson2], conceptsByLesson, lesson2);

      // c-old mastery 0.6 — above default threshold (0.5) but below custom (0.7)
      const masteryByConceptId = new Map([["c-old", 0.6]]);

      // With default config (reviewThreshold=0.5): 0.6 > 0.5, no review
      const defaultResult = suggestNext(makeInput(snapshot, { masteryByConceptId, now }));
      expect(defaultResult.reviews).toHaveLength(0);

      // With custom config (reviewThreshold=0.7): 0.6 < 0.7, triggers review
      const customConfig = { ...DEFAULT_ROUTER_CONFIG, reviewThreshold: 0.7 };
      const customResult = suggestNext(
        makeInput(snapshot, { masteryByConceptId, now }),
        customConfig,
      );
      expect(customResult.reviews).toHaveLength(1);
      expect(customResult.reviews[0]?.conceptId).toBe("c-old");
    });
  });
});
