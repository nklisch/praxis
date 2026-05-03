/**
 * Unit tests for ArtifactsServiceImpl — Phase 6.
 *
 * Uses useTempDb() for a real migrated SQLite database.
 * Seeds rows via direct Drizzle inserts to test the service's query + mutation logic.
 *
 * Covers:
 *  - course() returns null when not found; returns Course when found
 *  - courses() returns summaries for the student
 *  - lessons() returns lessons in order
 *  - markLessonStarted() upserts idempotently
 *  - markConceptStudied() flips lesson to completed when all concepts are studied
 *  - read() (CourseStateReader) returns null on student mismatch; returns snapshot when matched
 */
import { conceptProgress, courses, lessonProgress, lessons } from "@praxis/artifacts/schema";
import { conceptGraphs, concepts } from "@praxis/curriculum/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { ArtifactsServiceImpl } from "../services/artifacts-service.js";
import { brandId } from "../types/index.js";

const STUDENT_ID = brandId<"StudentId">("student-a");
const OTHER_STUDENT = brandId<"StudentId">("student-b");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

/** Phase 9: stub readers — return 0 / null so existing tests are unaffected. */
const MOCK_MASTERY_READER = {
  read: vi.fn().mockResolvedValue(0),
};
const MOCK_GRADE_READER = {
  readGrade: vi.fn().mockResolvedValue(null),
};

const dbCtx = useTempDb();

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function seedCourse(
  db: ReturnType<typeof openDb>["db"],
  overrides: { id?: string; studentId?: string } = {},
) {
  const id = overrides.id ?? "course-1";
  const graphId = "graph-1";
  // Insert concept graph first (FK).
  db.insert(conceptGraphs)
    .values({
      id: graphId,
      source: "extracted",
      name: "Test Graph",
      version: "1",
      createdAt: new Date(),
    })
    .run();
  db.insert(courses)
    .values({
      id,
      studentId: overrides.studentId ?? STUDENT_ID,
      title: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
      sourceJson: { kind: "bootstrapped", sourceMaterials: [] },
      conceptGraphId: graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return { courseId: brandId<"CourseId">(id), graphId };
}

function seedConcepts(db: ReturnType<typeof openDb>["db"], graphId: string) {
  const conceptId1 = "concept-1";
  const conceptId2 = "concept-2";
  db.insert(concepts)
    .values([
      {
        id: conceptId1,
        graphId,
        name: "Variables",
        description: "Symbols representing numbers",
        aliasesJson: [],
        standardsTagsJson: [],
      },
      {
        id: conceptId2,
        graphId,
        name: "Equations",
        description: "Statements of equality",
        aliasesJson: [],
        standardsTagsJson: [],
      },
    ])
    .run();
  return {
    conceptId1: brandId<"ConceptId">(conceptId1),
    conceptId2: brandId<"ConceptId">(conceptId2),
  };
}

function seedLesson(
  db: ReturnType<typeof openDb>["db"],
  courseId: string,
  conceptIds: string[],
  lessonId = "lesson-1",
) {
  db.insert(lessons)
    .values({
      id: lessonId,
      courseId,
      title: "Intro to Variables",
      orderIndex: 0,
      conceptIdsJson: conceptIds,
      referencesJson: [],
      suggestedStrategy: "worked-examples",
      estimatedMinutes: 45,
    })
    .run();
  return brandId<"LessonId">(lessonId);
}

// ─── course() ─────────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.course()", () => {
  it("returns null for unknown courseId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });
    const result = await svc.course(brandId<"CourseId">("nonexistent"));
    expect(result).toBeNull();
  });

  it("returns a Course for known courseId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db);
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });
    const result = await svc.course(courseId);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Algebra 1");
    expect(result?.id).toBe(courseId);
  });
});

// ─── lessons() ────────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.lessons()", () => {
  it("returns empty array for course with no lessons", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, { id: "course-no-lessons" });
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });
    const result = await svc.lessons(courseId);
    expect(result).toHaveLength(0);
  });

  it("returns lessons ordered by orderIndex", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, { id: "course-with-lessons" });
    // Insert in reverse order.
    db.insert(lessons)
      .values([
        {
          id: "lesson-b",
          courseId: "course-with-lessons",
          title: "Lesson B",
          orderIndex: 1,
          conceptIdsJson: [],
          referencesJson: [],
          suggestedStrategy: "worked-examples",
          estimatedMinutes: 30,
        },
        {
          id: "lesson-a",
          courseId: "course-with-lessons",
          title: "Lesson A",
          orderIndex: 0,
          conceptIdsJson: [],
          referencesJson: [],
          suggestedStrategy: "worked-examples",
          estimatedMinutes: 45,
        },
      ])
      .run();
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });
    const result = await svc.lessons(courseId);
    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe("Lesson A");
    expect(result[1]?.title).toBe("Lesson B");
  });
});

// ─── markLessonStarted() — upsert idempotency ─────────────────────────────────

describe("ArtifactsServiceImpl.markLessonStarted()", () => {
  it("inserts a lesson_progress row on first call", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, { id: "course-started" });
    const lessonId = seedLesson(db, "course-started", []);
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    await svc.markLessonStarted({ studentId: STUDENT_ID, lessonId });
    const rows = db.select().from(lessonProgress).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("in_progress");
    expect(courseId).toBeDefined(); // suppress unused warning
  });

  it("is idempotent — second call doesn't create a second row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, { id: "course-idem" });
    const lessonId = seedLesson(db, "course-idem", [], "lesson-idem");
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    await svc.markLessonStarted({ studentId: STUDENT_ID, lessonId });
    await svc.markLessonStarted({ studentId: STUDENT_ID, lessonId });
    const rows = db.select().from(lessonProgress).all();
    // Only the one for lesson-idem; could be more if previous tests ran — filter by lessonId.
    const matching = rows.filter((r) => r.lessonId === lessonId);
    expect(matching).toHaveLength(1);
    expect(courseId).toBeDefined();
  });
});

// ─── markConceptStudied() ─────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.markConceptStudied()", () => {
  it("marks concept as studied; lessonComplete=false when not all concepts done", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId, graphId } = seedCourse(db, { id: "course-mc1" });
    const { conceptId1, conceptId2 } = seedConcepts(db, graphId);
    seedLesson(db, "course-mc1", [conceptId1, conceptId2], "lesson-mc1");
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    // Mark lesson as started first.
    await svc.markLessonStarted({
      studentId: STUDENT_ID,
      lessonId: brandId<"LessonId">("lesson-mc1"),
    });

    const result = await svc.markConceptStudied({
      studentId: STUDENT_ID,
      conceptId: conceptId1,
    });
    expect(result.lessonComplete).toBe(false);
    expect(result.lessonId).toBe("lesson-mc1");

    const cpRows = db.select().from(conceptProgress).all();
    expect(cpRows).toHaveLength(1);
    expect(courseId).toBeDefined();
  });

  it("sets lessonComplete=true when all concepts in lesson are studied", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { graphId } = seedCourse(db, { id: "course-mc2" });
    const { conceptId1, conceptId2 } = seedConcepts(db, graphId);
    seedLesson(db, "course-mc2", [conceptId1, conceptId2], "lesson-mc2");
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    await svc.markLessonStarted({
      studentId: STUDENT_ID,
      lessonId: brandId<"LessonId">("lesson-mc2"),
    });
    await svc.markConceptStudied({ studentId: STUDENT_ID, conceptId: conceptId1 });
    const result = await svc.markConceptStudied({ studentId: STUDENT_ID, conceptId: conceptId2 });

    expect(result.lessonComplete).toBe(true);

    // lesson_progress row should now be "completed".
    const lpRows = db
      .select()
      .from(lessonProgress)
      .all()
      .filter((r) => r.lessonId === "lesson-mc2");
    expect(lpRows[0]?.status).toBe("completed");
  });
});

// ─── read() (CourseStateReader) ───────────────────────────────────────────────

describe("ArtifactsServiceImpl.read()", () => {
  it("returns null when course does not belong to the given student", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, { id: "course-mismatch", studentId: STUDENT_ID });
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    const result = await svc.read({ studentId: OTHER_STUDENT, courseId });
    expect(result).toBeNull();
  });

  it("returns a snapshot with currentLesson = first non-completed lesson", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId, graphId } = seedCourse(db, { id: "course-snap", studentId: STUDENT_ID });
    const { conceptId1 } = seedConcepts(db, graphId);
    const lessonId = seedLesson(db, "course-snap", [conceptId1], "lesson-snap");
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    const snapshot = await svc.read({ studentId: STUDENT_ID, courseId });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.course.title).toBe("Algebra 1");
    expect(snapshot?.lessons).toHaveLength(1);
    expect(snapshot?.currentLesson?.id).toBe(lessonId);
    expect(snapshot?.conceptsByLesson.size).toBe(1);
  });

  it("currentLesson is null when all lessons are completed", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId, graphId } = seedCourse(db, { id: "course-done", studentId: STUDENT_ID });
    const { conceptId1 } = seedConcepts(db, graphId);
    const lessonId = seedLesson(db, "course-done", [conceptId1], "lesson-done");
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    // Mark lesson as completed.
    db.insert(lessonProgress)
      .values({ studentId: STUDENT_ID, lessonId, status: "completed", startedAt: new Date() })
      .run();

    const snapshot = await svc.read({ studentId: STUDENT_ID, courseId });
    expect(snapshot?.currentLesson).toBeNull();
  });
});
