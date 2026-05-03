/**
 * Unit tests for ArtifactsServiceImpl Phase 9 gate methods.
 *
 * Covers:
 *  - gateView(): returns GateView[] with progress, isActive, lockReason, summaryText
 *  - evaluateAndPersistGates(): no-op when already unlocked; writes on state change
 *  - markGatesViewed(): updates viewedAt only for null rows
 *  - newlyUnlockedCount(): correct count before and after markGatesViewed
 *
 * Uses useTempDb() for isolated SQLite + migrations.
 * Mastery scores are controlled via a mock MasteryReader.
 */

import { courses, gates as gatesTable, gateUnlockEvents, lessons } from "@praxis/artifacts/schema";
import { conceptGraphs } from "@praxis/curriculum/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { ArtifactsServiceImpl } from "../services/artifacts-service.js";
import type { GradeReader, MasteryReader } from "../types/index.js";
import { brandId } from "../types/index.js";

const STUDENT_ID = brandId<"StudentId">("student-gates-test");
const COURSE_ID = brandId<"CourseId">("course-gates-test");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const noGradeReader: GradeReader = {
  readGrade: vi.fn().mockResolvedValue(null),
};

const dbCtx = useTempDb();

// ─── Seed helpers ──────────────────────────────────────────────────────────────

function seedCourse(db: ReturnType<typeof openDb>["db"]) {
  const graphId = "graph-gates-test";
  db.insert(conceptGraphs)
    .values({ id: graphId, source: "extracted", name: "Test", version: "1", createdAt: new Date() })
    .run();
  db.insert(courses)
    .values({
      id: COURSE_ID,
      studentId: STUDENT_ID,
      title: "Gates Course",
      subject: "math",
      gradeLevel: "9",
      sourceJson: { kind: "bootstrapped", sourceMaterials: [] },
      conceptGraphId: graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return graphId;
}

function seedLesson(
  db: ReturnType<typeof openDb>["db"],
  lessonId: string,
  conceptIds: string[] = [],
  orderIndex = 0,
) {
  db.insert(lessons)
    .values({
      id: lessonId,
      courseId: COURSE_ID,
      title: `Lesson ${lessonId}`,
      orderIndex,
      conceptIdsJson: conceptIds,
      referencesJson: [],
      suggestedStrategy: "worked-examples",
      estimatedMinutes: 30,
    })
    .run();
}

function seedGate(
  db: ReturnType<typeof openDb>["db"],
  opts: {
    id: string;
    lessonId: string;
    conceptId: string;
    minScore?: number;
    state?: object;
    prerequisites?: string[];
  },
) {
  db.insert(gatesTable)
    .values({
      id: opts.id,
      courseId: COURSE_ID,
      guardsJson: { kind: "lesson", lessonId: opts.lessonId },
      prerequisitesJson: opts.prerequisites ?? [],
      successCriteriaJson: {
        kind: "mastery-threshold",
        conceptIds: [opts.conceptId],
        minScore: opts.minScore ?? 0.7,
      },
      stateJson: opts.state ?? {
        kind: "locked",
        missingPrerequisites: [],
      },
      evidenceJson: [],
    })
    .run();
}

// ─── gateView() ────────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.gateView()", () => {
  it("returns empty array when no gates exist for the course", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: { read: vi.fn().mockResolvedValue(0) },
      gradeReader: noGradeReader,
    });

    const views = await svc.gateView({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(views).toHaveLength(0);
  });

  it("returns GateView with progress and isActive for a locked gate", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    seedLesson(db, "lesson-g1", ["concept-g1"]);
    seedGate(db, { id: "gate-g1", lessonId: "lesson-g1", conceptId: "concept-g1", minScore: 0.7 });

    const masteryReader: MasteryReader = { read: vi.fn().mockResolvedValue(0.35) };
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader,
      gradeReader: noGradeReader,
    });

    const views = await svc.gateView({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(views).toHaveLength(1);
    expect(views[0]?.gate.id).toBe("gate-g1");
    expect(views[0]?.isActive).toBe(true); // first locked gate with no blocked prereqs
    expect(views[0]?.progress).toBeCloseTo(0.5, 2); // 0.35 / 0.7 = 0.5
    expect(views[0]?.lockReason).toBeTruthy();
  });

  it("marks a gate as active (first locked, no blocked prereqs)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    seedLesson(db, "lesson-a1", ["concept-a1"], 0);
    seedLesson(db, "lesson-a2", ["concept-a2"], 1);
    // Gate A: unlocked already
    seedGate(db, {
      id: "gate-a1",
      lessonId: "lesson-a1",
      conceptId: "concept-a1",
      state: { kind: "unlocked", unlockedAt: Date.now(), evidence: [] },
    });
    // Gate A2: locked, prereq = gate-a1 (which is now unlocked)
    seedGate(db, {
      id: "gate-a2",
      lessonId: "lesson-a2",
      conceptId: "concept-a2",
      prerequisites: ["gate-a1"],
    });

    const masteryReader: MasteryReader = { read: vi.fn().mockResolvedValue(0.4) };
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader,
      gradeReader: noGradeReader,
    });

    const views = await svc.gateView({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(views).toHaveLength(2);
    const activeViews = views.filter((v) => v.isActive);
    expect(activeViews).toHaveLength(1);
    expect(activeViews[0]?.gate.id).toBe("gate-a2");
  });
});

// ─── evaluateAndPersistGates() ────────────────────────────────────────────────

describe("ArtifactsServiceImpl.evaluateAndPersistGates()", () => {
  it("returns empty unlockedGateIds and no writes when already unlocked (idempotent)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    seedLesson(db, "lesson-idm", ["concept-idm"]);
    seedGate(db, {
      id: "gate-idm",
      lessonId: "lesson-idm",
      conceptId: "concept-idm",
      state: { kind: "unlocked", unlockedAt: Date.now(), evidence: [] },
    });

    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: { read: vi.fn().mockResolvedValue(0.9) },
      gradeReader: noGradeReader,
    });

    const result = await svc.evaluateAndPersistGates({
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
    });
    expect(result.unlockedGateIds).toHaveLength(0);

    const events = db.select().from(gateUnlockEvents).all();
    expect(events).toHaveLength(0);
  });

  it("persists a newly unlocked gate and inserts a gate_unlock_event row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    seedLesson(db, "lesson-new-unlock", ["concept-new-unlock"]);
    seedGate(db, {
      id: "gate-new-unlock",
      lessonId: "lesson-new-unlock",
      conceptId: "concept-new-unlock",
    });

    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: { read: vi.fn().mockResolvedValue(0.9) }, // above threshold → unlock
      gradeReader: noGradeReader,
    });

    const result = await svc.evaluateAndPersistGates({
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
    });
    expect(result.unlockedGateIds).toHaveLength(1);
    expect(result.unlockedGateIds[0]).toBe("gate-new-unlock");

    // Gate row should now have state.kind = "unlocked"
    const gateRow = db.select().from(gatesTable).all().at(0);
    expect((gateRow?.stateJson as { kind: string } | undefined)?.kind).toBe("unlocked");

    // gate_unlock_events row should exist
    const events = db.select().from(gateUnlockEvents).all();
    expect(events).toHaveLength(1);
    expect(events[0]?.gateId).toBe("gate-new-unlock");
    expect(events[0]?.viewedAt).toBeNull();
  });

  it("second evaluate call produces no new transitions (idempotent after unlock)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    seedLesson(db, "lesson-idem2", ["concept-idem2"]);
    seedGate(db, {
      id: "gate-idem2",
      lessonId: "lesson-idem2",
      conceptId: "concept-idem2",
    });

    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: { read: vi.fn().mockResolvedValue(0.9) },
      gradeReader: noGradeReader,
    });

    await svc.evaluateAndPersistGates({ studentId: STUDENT_ID, courseId: COURSE_ID });
    const result2 = await svc.evaluateAndPersistGates({
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
    });
    expect(result2.unlockedGateIds).toHaveLength(0);

    // Only one unlock event row (from the first call)
    const events = db.select().from(gateUnlockEvents).all();
    expect(events).toHaveLength(1);
  });
});

// ─── markGatesViewed() + newlyUnlockedCount() ─────────────────────────────────

describe("ArtifactsServiceImpl.markGatesViewed() + newlyUnlockedCount()", () => {
  it("newlyUnlockedCount returns 0 when no unlock events exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: { read: vi.fn().mockResolvedValue(0) },
      gradeReader: noGradeReader,
    });

    const count = await svc.newlyUnlockedCount({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(count).toBe(0);
  });

  it("newlyUnlockedCount returns number of unviewed events", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    seedLesson(db, "lesson-view1", ["concept-view1"]);
    seedGate(db, { id: "gate-view1", lessonId: "lesson-view1", conceptId: "concept-view1" });

    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: { read: vi.fn().mockResolvedValue(0.9) },
      gradeReader: noGradeReader,
    });

    await svc.evaluateAndPersistGates({ studentId: STUDENT_ID, courseId: COURSE_ID });

    const count = await svc.newlyUnlockedCount({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(count).toBe(1);
  });

  it("markGatesViewed clears the newly-unlocked count", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    seedLesson(db, "lesson-clear1", ["concept-clear1"]);
    seedGate(db, { id: "gate-clear1", lessonId: "lesson-clear1", conceptId: "concept-clear1" });

    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: { read: vi.fn().mockResolvedValue(0.9) },
      gradeReader: noGradeReader,
    });

    await svc.evaluateAndPersistGates({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(await svc.newlyUnlockedCount({ studentId: STUDENT_ID, courseId: COURSE_ID })).toBe(1);

    await svc.markGatesViewed({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(await svc.newlyUnlockedCount({ studentId: STUDENT_ID, courseId: COURSE_ID })).toBe(0);

    // viewedAt should be set
    const events = db.select().from(gateUnlockEvents).all();
    expect(events[0]?.viewedAt).not.toBeNull();
  });

  it("markGatesViewed is idempotent — second call is a no-op", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    seedLesson(db, "lesson-idem3", ["concept-idem3"]);
    seedGate(db, { id: "gate-idem3", lessonId: "lesson-idem3", conceptId: "concept-idem3" });

    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: { read: vi.fn().mockResolvedValue(0.9) },
      gradeReader: noGradeReader,
    });

    await svc.evaluateAndPersistGates({ studentId: STUDENT_ID, courseId: COURSE_ID });
    await svc.markGatesViewed({ studentId: STUDENT_ID, courseId: COURSE_ID });
    // Should not throw, count should remain 0.
    await svc.markGatesViewed({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(await svc.newlyUnlockedCount({ studentId: STUDENT_ID, courseId: COURSE_ID })).toBe(0);
  });
});
