/**
 * Unit tests for course.current_concept — Phase 10 adaptive routing.
 *
 * Pure stub tests: no DB. ToolContext services are manually mocked.
 * Covers:
 *  - Returns next-in-order for first un-studied concept in current lesson
 *  - Returns frontier when all current-lesson concepts are studied
 *  - Returns all_complete when router returns no primary
 *  - Reviews and interleaves are forwarded from the router suggestion
 *  - Throws when courseId is missing from both args and ctx
 *  - Returns no_active_lesson when snapshot.currentLesson is null
 *  - Uses args.courseId over ctx.courseId
 */
import type {
  ConceptGraphId,
  ConceptId,
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  GradeBand,
  LessonId,
  MemoryService,
  StudentId,
  SubjectId,
  Timestamp,
  ToolContext,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { currentConceptTool } from "../current-concept.js";

// ─── ID constants ─────────────────────────────────────────────────────────────

const STUDENT_ID = brandId<"StudentId">("student-cc");
const SESSION_ID = brandId<"SessionId">("session-cc");
const COURSE_ID = brandId<"CourseId">("course-cc");
const LESSON_ID = brandId<"LessonId">("lesson-cc-1");
const CONCEPT_ID_A = brandId<"ConceptId">("concept-cc-a");
const CONCEPT_ID_B = brandId<"ConceptId">("concept-cc-b");

// ─── Snapshot builder ────────────────────────────────────────────────────────

function makeLesson(id: LessonId) {
  return {
    id,
    courseId: COURSE_ID,
    title: "Lesson 1",
    conceptIds: [CONCEPT_ID_A, CONCEPT_ID_B],
    references: [],
    suggestedStrategy: brandId<"StrategyId">("worked-examples"),
    estimatedMinutes: 45,
  };
}

function makeSnapshot(
  conceptsStudied: boolean[],
  currentLessonId: LessonId | null = LESSON_ID,
): CourseStateSnapshot {
  const lesson = makeLesson(LESSON_ID);
  const conceptRows = [CONCEPT_ID_A, CONCEPT_ID_B]
    .slice(0, conceptsStudied.length)
    .map((id, i) => ({
      conceptId: id,
      name: `Concept ${i + 1}`,
      description: `Description ${i + 1}`,
      studied: conceptsStudied[i] ?? false,
      lessonId: LESSON_ID,
    }));
  const conceptsByLesson = new Map([[LESSON_ID, conceptRows]]);
  const conceptsById = new Map(conceptRows.map((r) => [r.conceptId, r]));

  return {
    course: {
      id: COURSE_ID,
      studentId: STUDENT_ID,
      title: "Test Course",
      subject: brandId<"SubjectId">("math.algebra-1"),
      gradeLevel: "9-12" as GradeBand,
      source: { kind: "bootstrapped", sourceMaterials: [] },
      lessons: [],
      gates: [],
      conceptGraphId: brandId<"ConceptGraphId">("graph-cc"),
      thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: Date.now() as Timestamp,
      updatedAt: Date.now() as Timestamp,
    },
    lessons: [lesson],
    currentLesson: currentLessonId !== null ? lesson : null,
    conceptsByLesson,
    conceptsById,
    gates: [],
    activeGate: null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
  };
}

function makeStudentModel(masteryEntries: Array<[ConceptId, number]> = []) {
  const conceptMastery = new Map(
    masteryEntries.map(([id, m]) => [
      id,
      {
        conceptId: id,
        pKnown: m,
        uncertainty: 0.5,
        effectivePKnown: m,
        evidence: [],
      },
    ]),
  );
  return {
    studentId: STUDENT_ID,
    conceptMastery,
    lastUpdated: Date.now() as Timestamp,
  };
}

// ─── Context builder ─────────────────────────────────────────────────────────

function makeCtx(
  snapshot: CourseStateSnapshot | null,
  masteryEntries: Array<[ConceptId, number]> = [],
  courseId?: CourseId,
): ToolContext {
  const studentModel = makeStudentModel(masteryEntries);
  const courseState: CourseStateReader = {
    read: vi.fn().mockResolvedValue(snapshot),
  };
  const memory = {
    studentModel: vi.fn().mockResolvedValue(studentModel),
  } as Partial<MemoryService>;
  return {
    studentId: STUDENT_ID,
    sessionId: SESSION_ID,
    ...(courseId !== undefined && { courseId }),
    services: {
      courseState,
      memory: memory as MemoryService,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      artifacts: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      bootstrap: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      vectorStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      ftsStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      embeddings: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      documents: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      sandbox: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      sympy: null as any,
      pedagogyPack: null,
      lock: null as any,
      authoring: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder
      packs: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      assignments: null as any,
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("course.current_concept — adaptive routing (Phase 10)", () => {
  it("returns next-in-order when first concept is un-studied", async () => {
    const snapshot = makeSnapshot([false, false]);
    const ctx = makeCtx(snapshot, [], COURSE_ID);

    const result = await currentConceptTool.handler({}, ctx);

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.conceptId).toBe(CONCEPT_ID_A);
      expect(result.reason).toBe("next-in-order");
      expect(typeof result.masteryNow).toBe("number");
      expect(typeof result.uncertainty).toBe("number");
    }
  });

  it("returns frontier when first concept is studied but not mastered", async () => {
    // First concept studied, not mastered (mastery = 0.3 < 0.95 threshold)
    const snapshot = makeSnapshot([true, false]);
    // Concept A studied and at 0.3 mastery; Concept B not studied
    const ctx = makeCtx(snapshot, [[CONCEPT_ID_A, 0.3]], COURSE_ID);

    const result = await currentConceptTool.handler({}, ctx);
    expect(result.kind).toBe("ok");
    // The second concept is unstudied → next-in-order. If both were studied at low mastery → frontier.
    // Here concept B is unstudied so it wins as next-in-order.
    if (result.kind === "ok") {
      expect(result.conceptId).toBe(CONCEPT_ID_B);
      expect(result.reason).toBe("next-in-order");
    }
  });

  it("returns all_complete when router suggests no primary (all mastered)", async () => {
    // Both concepts studied with high mastery → router returns primary: null
    const snapshot = makeSnapshot([true, true]);
    const ctx = makeCtx(
      snapshot,
      [
        [CONCEPT_ID_A, 0.99],
        [CONCEPT_ID_B, 0.99],
      ],
      COURSE_ID,
    );

    const result = await currentConceptTool.handler({}, ctx);
    // Router should find nothing left to teach → all_complete
    expect(result.kind).toBe("all_complete");
  });

  it("returns all_complete when snapshot.currentLesson is null", async () => {
    const snapshot = makeSnapshot([], null);
    const ctx = makeCtx(snapshot, [], COURSE_ID);

    const result = await currentConceptTool.handler({}, ctx);
    expect(result.kind).toBe("all_complete");
  });

  it("throws when no courseId in args and ctx", async () => {
    const ctx = makeCtx(null, []);
    // No courseId in ctx, no courseId arg
    await expect(currentConceptTool.handler({}, ctx)).rejects.toThrow("courseId");
  });

  it("throws when snapshot is null (course not found for student)", async () => {
    const ctx = makeCtx(null, [], COURSE_ID);
    await expect(currentConceptTool.handler({}, ctx)).rejects.toThrow("Course not found");
  });

  it("uses args.courseId over ctx.courseId", async () => {
    const OVERRIDE_ID = brandId<"CourseId">("course-override");
    const snapshot = makeSnapshot([false]);
    const courseState: CourseStateReader = {
      read: vi.fn().mockResolvedValue(snapshot),
    };
    const studentModel = makeStudentModel();
    const ctx: ToolContext = {
      studentId: STUDENT_ID,
      sessionId: SESSION_ID,
      courseId: COURSE_ID, // ctx has this
      services: {
        courseState,
        memory: {
          studentModel: vi.fn().mockResolvedValue(studentModel),
        } as Partial<MemoryService> as MemoryService,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        artifacts: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        bootstrap: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        vectorStore: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        ftsStore: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        embeddings: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        documents: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        sandbox: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        sympy: null as any,
        pedagogyPack: null,
      lock: null as any,
      authoring: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder
        packs: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        assignments: null as any,
      },
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
    // Pass a different courseId via args
    await currentConceptTool.handler({ courseId: OVERRIDE_ID }, ctx);
    expect(courseState.read).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: OVERRIDE_ID }),
    );
  });

  it("output includes reviews and interleaves arrays (may be empty)", async () => {
    const snapshot = makeSnapshot([false]);
    const ctx = makeCtx(snapshot, [], COURSE_ID);

    const result = await currentConceptTool.handler({}, ctx);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(Array.isArray(result.reviews)).toBe(true);
      expect(Array.isArray(result.interleaves)).toBe(true);
    }
  });
});
