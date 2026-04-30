/**
 * ArtifactsServiceImpl — Phase 11 write method tests.
 *
 * Tests updateCourse, createLesson, updateLesson, deleteLesson,
 * createGate, updateGate, deleteGate, overrideGate, and getCourseSummary.
 * Uses useTempDb() for a real migrated SQLite database.
 */
import {
  courses,
  gates as gatesTable,
  gateUnlockEvents,
  lessonProgress,
  lessons,
} from "@praxis/artifacts/schema";
import { conceptGraphs } from "@praxis/curriculum/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { ArtifactsServiceImpl } from "../services/artifacts-service.js";
import { brandId } from "../types/index.js";

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const MOCK_MASTERY_READER = { read: vi.fn().mockResolvedValue(0) };
const MOCK_GRADE_READER = { readGrade: vi.fn().mockResolvedValue(null) };

const STUDENT_ID = brandId<"StudentId">("student-a");
const CONFIGURATOR_ID = brandId<"ConfiguratorId">("default");

const dbCtx = useTempDb();

function makeService(db: ReturnType<typeof openDb>["db"]) {
  return new ArtifactsServiceImpl({
    db,
    log: MOCK_LOG,
    masteryReader: MOCK_MASTERY_READER,
    gradeReader: MOCK_GRADE_READER,
  });
}

function seedCourse(db: ReturnType<typeof openDb>["db"], id = "course-1") {
  const graphId = `graph-${id}`;
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
      studentId: STUDENT_ID,
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

function seedLesson(
  db: ReturnType<typeof openDb>["db"],
  courseId: string,
  opts: { id?: string; orderIndex?: number; conceptIds?: string[] } = {},
) {
  const id = opts.id ?? "lesson-1";
  db.insert(lessons)
    .values({
      id,
      courseId,
      title: "Lesson 1",
      orderIndex: opts.orderIndex ?? 0,
      conceptIdsJson: opts.conceptIds ?? [],
      referencesJson: [],
      suggestedStrategy: "worked-examples",
      estimatedMinutes: 45,
    })
    .run();
  return brandId<"LessonId">(id);
}

function seedGate(
  db: ReturnType<typeof openDb>["db"],
  courseId: string,
  lessonId: string,
  gateId = "gate-1",
) {
  db.insert(gatesTable)
    .values({
      id: gateId,
      courseId,
      guardsJson: { kind: "lesson", lessonId },
      prerequisitesJson: [],
      successCriteriaJson: { kind: "mastery-threshold", conceptIds: [], minScore: 0.7 },
      stateJson: { kind: "locked", missingPrerequisites: [] },
      evidenceJson: [],
    })
    .run();
  return brandId<"GateId">(gateId);
}

// ─── updateCourse ─────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.updateCourse()", () => {
  it("updates the course title", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db);
    const svc = makeService(db);

    const updated = await svc.updateCourse({ courseId, patch: { title: "Algebra 2" } });
    expect(updated.title).toBe("Algebra 2");

    // Verify persisted.
    const fetched = await svc.course(courseId);
    expect(fetched?.title).toBe("Algebra 2");
  });

  it("updatedAt advances after update", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db);
    const svc = makeService(db);

    const original = await svc.course(courseId);
    expect(original).not.toBeNull();
    const originalUpdatedAt = original?.updatedAt ?? 0;

    // Small delay to ensure timestamp difference.
    await new Promise((r) => setTimeout(r, 5));
    await svc.updateCourse({ courseId, patch: { title: "New Title" } });

    const updated = await svc.course(courseId);
    expect(updated?.updatedAt).toBeGreaterThan(originalUpdatedAt);
  });

  it("throws when courseId does not exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    await expect(
      svc.updateCourse({ courseId: brandId<"CourseId">("nonexistent"), patch: { title: "X" } }),
    ).rejects.toThrow("not found after update");
  });
});

// ─── createLesson ─────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.createLesson()", () => {
  it("creates a lesson with auto-incremented orderIndex (appended at end)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db);
    seedLesson(db, courseId, { id: "lesson-existing", orderIndex: 0 });
    const svc = makeService(db);

    const lesson = await svc.createLesson({
      courseId,
      title: "New Lesson",
      conceptIds: [],
    });
    expect(lesson.title).toBe("New Lesson");
    expect(lesson.courseId).toBe(courseId);

    // Verify ordering via lessons() — new lesson should be second.
    const all = await svc.lessons(courseId);
    expect(all).toHaveLength(2);
    expect(all[1]?.title).toBe("New Lesson");
  });

  it("creates a lesson first when course has no lessons", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "empty-course");
    const svc = makeService(db);

    const lesson = await svc.createLesson({ courseId, title: "First", conceptIds: [] });
    expect(lesson.title).toBe("First");
    // Should be the only lesson.
    const all = await svc.lessons(courseId);
    expect(all).toHaveLength(1);
  });

  it("respects explicit orderIndex", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-explicit");
    const svc = makeService(db);

    // Seed a lesson at orderIndex 0 first.
    seedLesson(db, courseId, { id: "lesson-first", orderIndex: 0 });

    const lesson = await svc.createLesson({
      courseId,
      title: "Explicit Order",
      conceptIds: [],
      orderIndex: 5,
    });
    // When ordering by orderIndex, the explicit-5 lesson comes last.
    const all = await svc.lessons(courseId);
    expect(all[1]?.id).toBe(lesson.id);
  });

  it("defaults estimatedMinutes to 30 when omitted", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-defaults");
    const svc = makeService(db);

    const lesson = await svc.createLesson({ courseId, title: "L", conceptIds: [] });
    expect(lesson.estimatedMinutes).toBe(30);
  });
});

// ─── updateLesson ─────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.updateLesson()", () => {
  it("updates title and conceptIds", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-ul");
    const lessonId = seedLesson(db, courseId, { id: "lesson-ul" });
    const svc = makeService(db);

    const conceptId = brandId<"ConceptId">("c-1");
    const updated = await svc.updateLesson({
      lessonId,
      patch: { title: "Updated Title", conceptIds: [conceptId] },
    });
    expect(updated.title).toBe("Updated Title");
    expect(updated.conceptIds).toEqual([conceptId]);
  });

  it("throws when lessonId not found", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    await expect(
      svc.updateLesson({
        lessonId: brandId<"LessonId">("nonexistent"),
        patch: { title: "X" },
      }),
    ).rejects.toThrow("not found after update");
  });
});

// ─── deleteLesson ─────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.deleteLesson()", () => {
  it("deletes the lesson row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-dl");
    const lessonId = seedLesson(db, courseId, { id: "lesson-dl" });
    const svc = makeService(db);

    await svc.deleteLesson({ lessonId });
    const remaining = await svc.lessons(courseId);
    expect(remaining).toHaveLength(0);
  });

  it("cascades to lesson_progress rows", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-dl-lp");
    const lessonId = seedLesson(db, courseId, { id: "lesson-dl-lp" });

    // Seed a lesson_progress row.
    db.insert(lessonProgress)
      .values({ studentId: STUDENT_ID, lessonId, status: "in_progress", startedAt: new Date() })
      .run();

    const svc = makeService(db);
    await svc.deleteLesson({ lessonId });

    // lesson_progress should be gone (FK cascades + explicit delete).
    const allProgress = db.select().from(lessonProgress).all();
    expect(allProgress).toHaveLength(0);
  });

  it("cascades to gates whose guards.lessonId === lessonId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-dl-gates");
    const lessonId = seedLesson(db, courseId, { id: "lesson-dl-gates" });
    seedGate(db, courseId, "lesson-dl-gates", "gate-for-lesson");

    const svc = makeService(db);
    await svc.deleteLesson({ lessonId });

    // The gate that guards this lesson should be deleted.
    const remainingGates = await svc.gates(courseId);
    expect(remainingGates).toHaveLength(0);
  });

  it("does not delete gates that guard a different lessonId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-dl-other-gate");
    const lessonId1 = seedLesson(db, courseId, { id: "lesson-dl-1", orderIndex: 0 });
    const _lessonId2 = seedLesson(db, courseId, { id: "lesson-dl-2", orderIndex: 1 });
    // Gate guards lesson-dl-2, not lesson-dl-1.
    seedGate(db, courseId, "lesson-dl-2", "gate-for-lesson-2");

    const svc = makeService(db);
    await svc.deleteLesson({ lessonId: lessonId1 });

    // Gate guarding lesson-2 should survive.
    const remainingGates = await svc.gates(courseId);
    expect(remainingGates).toHaveLength(1);
  });
});

// ─── createGate ───────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.createGate()", () => {
  it("creates a gate with locked initial state", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-cg");
    const lessonId = seedLesson(db, courseId, { id: "lesson-cg" });
    const svc = makeService(db);

    const gate = await svc.createGate({
      courseId,
      guards: { kind: "lesson", lessonId },
      prerequisites: [],
      successCriteria: { kind: "mastery-threshold", conceptIds: [], minScore: 0.7 },
    });
    expect(gate.state.kind).toBe("locked");
    expect(gate.courseId).toBe(courseId);
  });
});

// ─── updateGate ───────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.updateGate()", () => {
  it("updates successCriteria while preserving state", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-ug");
    const _lessonId = seedLesson(db, courseId, { id: "lesson-ug" });
    const gateId = seedGate(db, courseId, "lesson-ug", "gate-ug");
    const svc = makeService(db);

    const newCriteria = {
      kind: "mastery-threshold" as const,
      conceptIds: [brandId<"ConceptId">("c-1")],
      minScore: 0.8,
    };
    const updated = await svc.updateGate({ gateId, patch: { successCriteria: newCriteria } });
    expect(updated.successCriteria).toEqual(newCriteria);
    // State preserved.
    expect(updated.state.kind).toBe("locked");
  });
});

// ─── deleteGate ───────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.deleteGate()", () => {
  it("deletes the gate row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-dg");
    const _lessonId = seedLesson(db, courseId, { id: "lesson-dg" });
    const gateId = seedGate(db, courseId, "lesson-dg", "gate-dg");
    const svc = makeService(db);

    await svc.deleteGate({ gateId });
    const remaining = await svc.gates(courseId);
    expect(remaining).toHaveLength(0);
  });
});

// ─── overrideGate ─────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.overrideGate()", () => {
  it("sets gate state to overridden and writes a gate_unlock_events row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-og");
    const _lessonId = seedLesson(db, courseId, { id: "lesson-og" });
    const gateId = seedGate(db, courseId, "lesson-og", "gate-og");
    const svc = makeService(db);

    const result = await svc.overrideGate({
      gateId,
      reason: "Student requested fresh start",
      configuratorId: CONFIGURATOR_ID,
      studentId: STUDENT_ID,
      courseId,
    });

    expect(result.state.kind).toBe("overridden");
    if (result.state.kind === "overridden") {
      expect(result.state.reason).toBe("Student requested fresh start");
      expect(result.state.by).toBe(CONFIGURATOR_ID);
    }

    // Verify gate_unlock_events row was written.
    const events = db.select().from(gateUnlockEvents).all();
    expect(events).toHaveLength(1);
    expect(events[0]?.gateId).toBe(gateId);
    expect(events[0]?.studentId).toBe(STUDENT_ID);
  });
});

// ─── getCourseSummary ─────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.getCourseSummary()", () => {
  it("returns course, lessons, gates, concepts in one snapshot", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId } = seedCourse(db, "course-gs");
    seedLesson(db, courseId, { id: "lesson-gs" });
    seedGate(db, courseId, "lesson-gs", "gate-gs");
    const svc = makeService(db);

    const summary = await svc.getCourseSummary(courseId);
    expect(summary.course.id).toBe(courseId);
    expect(summary.lessons).toHaveLength(1);
    expect(summary.gates).toHaveLength(1);
    // No concepts seeded — array is empty.
    expect(Array.isArray(summary.concepts)).toBe(true);
  });

  it("throws when courseId does not exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    await expect(svc.getCourseSummary(brandId<"CourseId">("nonexistent"))).rejects.toThrow(
      "not found",
    );
  });
});
