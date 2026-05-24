/**
 * Tests for ProgressServiceImpl.
 *
 * Covers: empty-courses path, single-course full data, multi-course rollups,
 * stuck-concept selection (threshold + bottom-3), recent-events ordering.
 */

import {
  assignments,
  courses as coursesTable,
  gates as gatesTable,
  gateUnlockEvents,
  lessonProgress,
  lessons as lessonsTable,
} from "@praxis/artifacts/schema";
import { conceptGraphs, concepts as conceptsTable } from "@praxis/curriculum/schema";
import { sessions, studentMastery } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import type {
  ConceptId,
  CourseId,
  CourseStateSnapshot,
  GateView,
  LessonId,
  StudentId,
  Timestamp,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import type { ProgressService } from "../../types/progress.js";
import { ProgressServiceImpl, STUCK_MASTERY_THRESHOLD } from "../progress-service.js";

// ── DB fixture ────────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

function makeLog() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => makeLog()),
  };
}

function makeStudentId(): StudentId {
  return brandId<"StudentId">("student-progress-test") as StudentId;
}

// ── CourseStateReader fake ────────────────────────────────────────────────────

/**
 * Minimal fake CourseStateReader that returns a pre-built snapshot or null.
 */
function makeFakeCourseStateReader(snapshot: CourseStateSnapshot | null = null): {
  read: (input: {
    studentId: StudentId;
    courseId: CourseId;
  }) => Promise<CourseStateSnapshot | null>;
} {
  return {
    read: vi.fn().mockResolvedValue(snapshot),
  };
}

/**
 * Make a minimal CourseStateSnapshot for testing.
 */
function makeSnapshot(opts: {
  courseId: CourseId;
  lessons?: Array<{ id: LessonId; title: string; conceptIds: ConceptId[] }>;
  currentLessonId?: LessonId | null;
  activeGate?: GateView | null;
}): CourseStateSnapshot {
  const lessons = (opts.lessons ?? []).map((l) => ({
    id: l.id,
    courseId: opts.courseId,
    title: l.title,
    orderIndex: 0,
    conceptIds: l.conceptIds,
    references: [],
    suggestedStrategy: brandId<"StrategyId">("direct"),
    estimatedMinutes: 30,
  }));

  const currentLesson =
    opts.currentLessonId !== undefined
      ? (lessons.find((l) => l.id === opts.currentLessonId) ?? null)
      : (lessons[0] ?? null);

  const conceptsByLesson = new Map<LessonId, import("../../types/index.js").ConceptStateRow[]>();
  for (const lesson of lessons) {
    conceptsByLesson.set(
      lesson.id,
      lesson.conceptIds.map((cid) => ({
        conceptId: cid,
        name: `Concept ${cid}`,
        description: "",
        studied: false,
        lessonId: lesson.id,
      })),
    );
  }

  const conceptsById = new Map<ConceptId, import("../../types/index.js").ConceptStateRow>();
  for (const rows of conceptsByLesson.values()) {
    for (const row of rows) {
      conceptsById.set(row.conceptId, row);
    }
  }

  const activeGate = opts.activeGate !== undefined ? opts.activeGate : null;

  return {
    course: {
      id: opts.courseId,
      studentId: makeStudentId(),
      title: "Test Course",
      subject: brandId<"SubjectId">("math"),
      gradeLevel: "9-12",
      source: { kind: "bootstrapped", sourceMaterials: [] },
      lessons: lessons.map((l) => l.id),
      conceptGraphId: brandId<"ConceptGraphId">(
        "graph-id",
      ) as import("../../types/index.js").ConceptGraphId,
      gates: [],
      thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: Date.now() as Timestamp,
      updatedAt: Date.now() as Timestamp,
    },
    lessons,
    currentLesson,
    conceptsByLesson,
    conceptsById,
    gates: activeGate ? [activeGate] : [],
    activeGate,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
  };
}

// ── DB insert helpers ─────────────────────────────────────────────────────────

type DbType = ReturnType<typeof openDb>["db"];

function insertCourse(db: DbType, opts: { studentId: StudentId; title?: string }): CourseId {
  const id = uuidv7();
  const graphId = uuidv7();

  db.insert(conceptGraphs)
    .values({
      id: graphId,
      source: "canonical",
      name: "test-graph",
      version: "1.0.0",
      createdAt: new Date(),
    })
    .run();

  db.insert(coursesTable)
    .values({
      id,
      studentId: opts.studentId,
      title: opts.title ?? "Test Course",
      subject: "math",
      gradeLevel: "9-12",
      sourceJson: { kind: "bootstrapped" },
      conceptGraphId: graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  return brandId<"CourseId">(id) as CourseId;
}

function insertLesson(
  db: DbType,
  opts: { courseId: CourseId; conceptIds?: string[]; orderIndex?: number; title?: string },
): LessonId {
  const id = uuidv7();
  db.insert(lessonsTable)
    .values({
      id,
      courseId: opts.courseId,
      title: opts.title ?? "Test Lesson",
      orderIndex: opts.orderIndex ?? 0,
      conceptIdsJson: opts.conceptIds ?? [],
      referencesJson: [],
      suggestedStrategy: "direct",
      estimatedMinutes: 30,
    })
    .run();
  return brandId<"LessonId">(id) as LessonId;
}

function insertConcept(db: DbType, opts: { graphId: string; name?: string }): ConceptId {
  const id = uuidv7();
  db.insert(conceptsTable)
    .values({
      id,
      graphId: opts.graphId,
      name: opts.name ?? "Test Concept",
      description: "A test concept",
      aliasesJson: [],
      standardsTagsJson: [],
    })
    .run();
  return brandId<"ConceptId">(id) as ConceptId;
}

function insertMastery(
  db: DbType,
  opts: { studentId: StudentId; conceptId: ConceptId; pKnownMilli: number },
): void {
  db.insert(studentMastery)
    .values({
      studentId: opts.studentId,
      conceptId: opts.conceptId,
      pKnown: opts.pKnownMilli,
      uncertainty: 200,
      effectivePKnown: opts.pKnownMilli,
      evidenceJson: [],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [studentMastery.studentId, studentMastery.conceptId],
      set: {
        pKnown: opts.pKnownMilli,
        effectivePKnown: opts.pKnownMilli,
      },
    })
    .run();
}

function insertSession(
  db: DbType,
  opts: {
    studentId: StudentId;
    courseId?: CourseId;
    modeId?: string;
    startedAt?: Date;
    endedAt?: Date | null;
  },
): string {
  const id = uuidv7();
  db.insert(sessions)
    .values({
      id,
      studentId: opts.studentId,
      courseId: opts.courseId,
      modeId: opts.modeId ?? "teach",
      engineId: "direct.anthropic",
      startedAt: opts.startedAt ?? new Date(),
      endedAt: opts.endedAt ?? null,
    })
    .run();
  return id;
}

function insertGateUnlock(
  db: DbType,
  opts: { studentId: StudentId; courseId: CourseId; gateId: string; unlockedAt?: Date },
): void {
  db.insert(gateUnlockEvents)
    .values({
      id: uuidv7(),
      studentId: opts.studentId,
      courseId: opts.courseId,
      gateId: opts.gateId,
      unlockedAt: opts.unlockedAt ?? new Date(),
      evidenceJson: [],
    })
    .run();
}

function insertGate(db: DbType, opts: { courseId: CourseId; id?: string }): string {
  const id = opts.id ?? uuidv7();
  db.insert(gatesTable)
    .values({
      id,
      courseId: opts.courseId,
      guardsJson: { kind: "course-completion" },
      prerequisitesJson: [],
      successCriteriaJson: {
        kind: "mastery-threshold",
        conceptIds: [],
        minScore: 0.7,
      },
      stateJson: "locked",
      evidenceJson: [],
    })
    .run();
  return id;
}

function insertAssignment(
  db: DbType,
  opts: {
    courseId: CourseId;
    kind?: "quiz" | "homework" | "exam";
    title?: string;
    submittedAt?: Date | null;
  },
): string {
  const id = uuidv7();
  db.insert(assignments)
    .values({
      id,
      courseId: opts.courseId,
      kind: opts.kind ?? "quiz",
      title: opts.title ?? "Test Assignment",
      itemsJson: [],
      conceptIdsJson: [],
      assignedAt: new Date(Date.now() - 60_000),
      submittedAt: opts.submittedAt ?? null,
      gradeJson: opts.submittedAt ? { total: 0.8, items: [] } : null,
    })
    .run();
  return id;
}

// ── Service factory ───────────────────────────────────────────────────────────

function makeService(courseStateSnapshot: CourseStateSnapshot | null = null): {
  service: ProgressService;
  db: DbType;
} {
  const { db } = openDb({ path: dbCtx.dbPath });
  const service = new ProgressServiceImpl({
    db,
    log: makeLog(),
    courseStateReader: makeFakeCourseStateReader(courseStateSnapshot),
  });
  return { service, db };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("STUCK_MASTERY_THRESHOLD", () => {
  it("equals 0.7", () => {
    expect(STUCK_MASTERY_THRESHOLD).toBe(0.7);
  });
});

describe("ProgressServiceImpl — empty courses", () => {
  it("returns empty array when student has no courses", async () => {
    const { service } = makeService();
    const studentId = makeStudentId();
    const result = await service.rollup({ studentId });
    expect(result).toEqual([]);
  });
});

describe("ProgressServiceImpl — single course with no data", () => {
  it("returns one rollup with zero mastery and empty arrays when no DB data", async () => {
    const { service, db } = makeService(null);
    const studentId = makeStudentId();
    insertCourse(db, { studentId, title: "Algebra" });

    const result = await service.rollup({ studentId });
    expect(result).toHaveLength(1);
    const rollup = result[0]!;
    expect(rollup.courseTitle).toBe("Algebra");
    expect(rollup.masteryPercent).toBe(0);
    expect(rollup.currentLesson).toBeNull();
    expect(rollup.activeGate).toBeNull();
    expect(rollup.stuckConcepts).toHaveLength(0);
    expect(rollup.recentEvents).toHaveLength(0);
  });
});

describe("ProgressServiceImpl — single course with full data", () => {
  it("populates all fields correctly", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();

    // Create concept graph first, then course referencing it.
    const graphId = uuidv7();
    db.insert(conceptGraphs)
      .values({
        id: graphId,
        source: "canonical",
        name: "g",
        version: "1.0",
        createdAt: new Date(),
      })
      .run();

    const courseRow = {
      id: uuidv7(),
      studentId,
      title: "Algebra",
      subject: "math",
      gradeLevel: "9-12" as const,
      sourceJson: { kind: "bootstrapped" as const },
      conceptGraphId: graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    db.insert(coursesTable).values(courseRow).run();
    const courseId = brandId<"CourseId">(courseRow.id) as CourseId;

    // Insert concept using the same graphId
    const conceptId = insertConcept(db, { graphId, name: "Quadratics" });
    const lessonId = brandId<"LessonId">(uuidv7()) as LessonId;
    db.insert(lessonsTable)
      .values({
        id: lessonId,
        courseId,
        title: "Intro to Quadratics",
        orderIndex: 0,
        conceptIdsJson: [conceptId],
        referencesJson: [],
        suggestedStrategy: "direct",
        estimatedMinutes: 30,
      })
      .run();

    // Insert mastery at 30% (stuck)
    insertMastery(db, { studentId, conceptId, pKnownMilli: 300 });

    const snapshot = makeSnapshot({
      courseId,
      lessons: [{ id: lessonId, title: "Intro to Quadratics", conceptIds: [conceptId] }],
      currentLessonId: lessonId,
    });

    // Insert a session event
    insertSession(db, {
      studentId,
      courseId,
      modeId: "teach",
      startedAt: new Date(Date.now() - 3_600_000),
    });

    const { db: db2 } = openDb({ path: dbCtx.dbPath });
    const service = new ProgressServiceImpl({
      db: db2,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(snapshot),
    });

    const result = await service.rollup({ studentId });
    expect(result).toHaveLength(1);
    const rollup = result[0]!;

    expect(rollup.courseId).toBe(courseId);
    expect(rollup.courseTitle).toBe("Algebra");
    expect(rollup.masteryPercent).toBeGreaterThanOrEqual(0);
    expect(rollup.currentLesson).toBeDefined();
    expect(rollup.currentLesson?.title).toBe("Intro to Quadratics");
    expect(rollup.currentLesson?.index).toBe(1);
    expect(rollup.currentLesson?.total).toBe(1);
    expect(rollup.recentEvents).toHaveLength(1);
    expect(rollup.recentEvents[0]!.kind).toBe("session");
  });
});

describe("ProgressServiceImpl — mastery percent", () => {
  it("computes mean effectivePKnown from snapshot conceptsByLesson", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const conceptId1 = brandId<"ConceptId">(uuidv7()) as ConceptId;
    const conceptId2 = brandId<"ConceptId">(uuidv7()) as ConceptId;

    // Insert mastery: 400 (40%) and 600 (60%) → mean = 50%
    insertMastery(db, { studentId, conceptId: conceptId1, pKnownMilli: 400 });
    insertMastery(db, { studentId, conceptId: conceptId2, pKnownMilli: 600 });

    const lessonId = brandId<"LessonId">(uuidv7()) as LessonId;
    const snapshot = makeSnapshot({
      courseId,
      lessons: [{ id: lessonId, title: "L1", conceptIds: [conceptId1, conceptId2] }],
    });

    const service = new ProgressServiceImpl({
      db,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(snapshot),
    });

    const result = await service.rollup({ studentId });
    const rollup = result[0]!;
    expect(rollup.masteryPercent).toBeCloseTo(0.5);
  });

  it("returns 0 mastery when no concepts in course", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const snapshot = makeSnapshot({ courseId, lessons: [] });
    const service = new ProgressServiceImpl({
      db,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(snapshot),
    });

    const result = await service.rollup({ studentId });
    expect(result[0]!.masteryPercent).toBe(0);
  });
});

describe("ProgressServiceImpl — stuck concepts (threshold + bottom-3)", () => {
  it("excludes concepts at or above threshold (0.7)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const graphId = uuidv7();
    db.insert(conceptGraphs)
      .values({
        id: graphId,
        source: "canonical",
        name: "g",
        version: "1.0",
        createdAt: new Date(),
      })
      .run();

    const conceptA = insertConcept(db, { graphId, name: "Above threshold" });
    const conceptB = insertConcept(db, { graphId, name: "Below threshold" });
    insertLesson(db, { courseId, conceptIds: [conceptA, conceptB] });

    insertMastery(db, { studentId, conceptId: conceptA, pKnownMilli: 800 }); // 80% — above
    insertMastery(db, { studentId, conceptId: conceptB, pKnownMilli: 400 }); // 40% — stuck

    const { db: db2 } = openDb({ path: dbCtx.dbPath });
    const service = new ProgressServiceImpl({
      db: db2,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(null),
    });

    const result = await service.rollup({ studentId });
    const rollup = result[0]!;
    expect(rollup.stuckConcepts).toHaveLength(1);
    expect(rollup.stuckConcepts[0]!.name).toBe("Below threshold");
    expect(rollup.stuckConcepts[0]!.mastery).toBeCloseTo(0.4);
  });

  it("selects bottom-3 concepts and orders by mastery ascending", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const graphId = uuidv7();
    db.insert(conceptGraphs)
      .values({
        id: graphId,
        source: "canonical",
        name: "g",
        version: "1.0",
        createdAt: new Date(),
      })
      .run();

    // 5 stuck concepts with varying mastery
    const masteryLevels = [100, 200, 300, 400, 500]; // 10%, 20%, 30%, 40%, 50%
    const conceptIds: ConceptId[] = [];
    for (const milli of masteryLevels) {
      const cid = insertConcept(db, { graphId, name: `Concept ${milli}` });
      conceptIds.push(cid);
      insertMastery(db, { studentId, conceptId: cid, pKnownMilli: milli });
    }

    insertLesson(db, { courseId, conceptIds: conceptIds.map((c) => c) });

    const { db: db2 } = openDb({ path: dbCtx.dbPath });
    const service = new ProgressServiceImpl({
      db: db2,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(null),
    });

    const result = await service.rollup({ studentId });
    const rollup = result[0]!;

    // Only bottom 3 (10%, 20%, 30%)
    expect(rollup.stuckConcepts).toHaveLength(3);
    expect(rollup.stuckConcepts[0]!.mastery).toBeCloseTo(0.1); // lowest first
    expect(rollup.stuckConcepts[1]!.mastery).toBeCloseTo(0.2);
    expect(rollup.stuckConcepts[2]!.mastery).toBeCloseTo(0.3);
  });

  it("returns empty stuckConcepts when course has no lessons", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const service = new ProgressServiceImpl({
      db,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(null),
    });

    const result = await service.rollup({ studentId });
    expect(result[0]!.stuckConcepts).toHaveLength(0);
  });
});

describe("ProgressServiceImpl — recent events ordering", () => {
  it("merges and sorts events across kinds newest-first", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const now = Date.now();
    const gateId = insertGate(db, { courseId });

    // Oldest event: session ended 5h ago (startedAt 6h ago, endedAt 5h ago)
    insertSession(db, {
      studentId,
      courseId,
      modeId: "teach",
      startedAt: new Date(now - 6 * 3_600_000),
      endedAt: new Date(now - 5 * 3_600_000),
    });

    // Middle event: gate unlock 3h ago
    insertGateUnlock(db, {
      studentId,
      courseId,
      gateId,
      unlockedAt: new Date(now - 3 * 3_600_000),
    });

    // Newest event: assignment submitted 1h ago
    insertAssignment(db, {
      courseId,
      title: "Quiz 1",
      submittedAt: new Date(now - 1 * 3_600_000),
    });

    const { db: db2 } = openDb({ path: dbCtx.dbPath });
    const service = new ProgressServiceImpl({
      db: db2,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(null),
    });

    const result = await service.rollup({ studentId });
    const rollup = result[0]!;

    expect(rollup.recentEvents).toHaveLength(3);
    // Newest first: grade (1h ago) > gate (3h ago) > session (5h ago)
    expect(rollup.recentEvents[0]!.kind).toBe("grade");
    expect(rollup.recentEvents[1]!.kind).toBe("gate");
    expect(rollup.recentEvents[2]!.kind).toBe("session");
  });

  it("caps recent events at 3 total across all kinds", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });
    const now = Date.now();

    // Insert 4 sessions (all recent)
    for (let i = 0; i < 4; i++) {
      insertSession(db, {
        studentId,
        courseId,
        startedAt: new Date(now - i * 3_600_000),
      });
    }

    const { db: db2 } = openDb({ path: dbCtx.dbPath });
    const service = new ProgressServiceImpl({
      db: db2,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(null),
    });

    const result = await service.rollup({ studentId });
    const rollup = result[0]!;
    expect(rollup.recentEvents).toHaveLength(3);
  });

  it("returns correct kind labels for each event type", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });
    const now = Date.now();
    const gateId = insertGate(db, { courseId });

    insertSession(db, { studentId, courseId, startedAt: new Date(now - 5 * 3_600_000) });
    insertGateUnlock(db, {
      studentId,
      courseId,
      gateId,
      unlockedAt: new Date(now - 4 * 3_600_000),
    });
    insertAssignment(db, { courseId, title: "Quiz", submittedAt: new Date(now - 3 * 3_600_000) });

    const { db: db2 } = openDb({ path: dbCtx.dbPath });
    const service = new ProgressServiceImpl({
      db: db2,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(null),
    });

    const result = await service.rollup({ studentId });
    const kinds = result[0]!.recentEvents.map((e) => e.kind);
    expect(kinds).toContain("session");
    expect(kinds).toContain("gate");
    expect(kinds).toContain("grade");
  });

  it("excludes unsubmitted assignments from grade events", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    // Unsubmitted assignment — should not appear
    insertAssignment(db, { courseId, title: "Pending Quiz", submittedAt: null });

    const { db: db2 } = openDb({ path: dbCtx.dbPath });
    const service = new ProgressServiceImpl({
      db: db2,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(null),
    });

    const result = await service.rollup({ studentId });
    const gradeEvents = result[0]!.recentEvents.filter((e) => e.kind === "grade");
    expect(gradeEvents).toHaveLength(0);
  });
});

describe("ProgressServiceImpl — multiple courses", () => {
  it("returns one rollup per course, ordered by course list order", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();

    const courseId1 = insertCourse(db, { studentId, title: "Algebra" });
    const courseId2 = insertCourse(db, { studentId, title: "Geometry" });

    const service = new ProgressServiceImpl({
      db,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(null),
    });

    const result = await service.rollup({ studentId });
    expect(result).toHaveLength(2);

    const ids = result.map((r) => r.courseId);
    expect(ids).toContain(courseId1);
    expect(ids).toContain(courseId2);

    const titles = result.map((r) => r.courseTitle);
    expect(titles).toContain("Algebra");
    expect(titles).toContain("Geometry");
  });

  it("does not mix events across courses", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();

    const courseId1 = insertCourse(db, { studentId, title: "Course A" });
    const courseId2 = insertCourse(db, { studentId, title: "Course B" });

    // Insert a session only for course 2
    insertSession(db, { studentId, courseId: courseId2, modeId: "teach" });

    const service = new ProgressServiceImpl({
      db,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(null),
    });

    const result = await service.rollup({ studentId });
    const rollupA = result.find((r) => r.courseId === courseId1)!;
    const rollupB = result.find((r) => r.courseId === courseId2)!;

    expect(rollupA.recentEvents).toHaveLength(0);
    expect(rollupB.recentEvents).toHaveLength(1);
  });
});

describe("ProgressServiceImpl — currentLesson from snapshot", () => {
  it("sets currentLesson with 1-based index and total count", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const lessonId1 = brandId<"LessonId">(uuidv7()) as LessonId;
    const lessonId2 = brandId<"LessonId">(uuidv7()) as LessonId;
    const lessonId3 = brandId<"LessonId">(uuidv7()) as LessonId;

    const snapshot = makeSnapshot({
      courseId,
      lessons: [
        { id: lessonId1, title: "L1", conceptIds: [] },
        { id: lessonId2, title: "L2", conceptIds: [] },
        { id: lessonId3, title: "L3", conceptIds: [] },
      ],
      currentLessonId: lessonId2, // currently on lesson 2
    });

    const service = new ProgressServiceImpl({
      db,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(snapshot),
    });

    const result = await service.rollup({ studentId });
    const rollup = result[0]!;

    expect(rollup.currentLesson).not.toBeNull();
    expect(rollup.currentLesson!.title).toBe("L2");
    expect(rollup.currentLesson!.index).toBe(2); // 1-based
    expect(rollup.currentLesson!.total).toBe(3);
  });

  it("sets currentLesson to null when snapshot returns null currentLesson", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const snapshot = makeSnapshot({
      courseId,
      lessons: [],
      currentLessonId: null,
    });

    const service = new ProgressServiceImpl({
      db,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(snapshot),
    });

    const result = await service.rollup({ studentId });
    expect(result[0]!.currentLesson).toBeNull();
  });
});

describe("ProgressServiceImpl — activeGate from snapshot", () => {
  it("populates activeGate fields from GateView", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const gateId = brandId<"GateId">(uuidv7()) as import("../../types/index.js").GateId;
    const fakeGate: GateView = {
      gate: {
        id: gateId,
        courseId,
        guards: { kind: "course-completion" },
        prerequisites: [],
        successCriteria: { kind: "mastery-threshold", conceptIds: [], minScore: 0.7 },
        state: { kind: "locked", missingPrerequisites: [] },
        evidence: [],
      },
      summaryText: "Master quadratics",
      lockReason: "Mastery below 70%",
      progress: 0.4,
      isActive: true,
    };

    const snapshot = makeSnapshot({ courseId, activeGate: fakeGate });

    const service = new ProgressServiceImpl({
      db,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(snapshot),
    });

    const result = await service.rollup({ studentId });
    const rollup = result[0]!;

    expect(rollup.activeGate).not.toBeNull();
    expect(rollup.activeGate!.id).toBe(gateId);
    expect(rollup.activeGate!.title).toBe("Master quadratics");
    expect(rollup.activeGate!.lockReason).toBe("Mastery below 70%");
    expect(rollup.activeGate!.progress).toBeCloseTo(0.4);
  });

  it("sets activeGate to null when snapshot has no active gate", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const studentId = makeStudentId();
    const courseId = insertCourse(db, { studentId });

    const snapshot = makeSnapshot({ courseId, activeGate: null });

    const service = new ProgressServiceImpl({
      db,
      log: makeLog(),
      courseStateReader: makeFakeCourseStateReader(snapshot),
    });

    const result = await service.rollup({ studentId });
    expect(result[0]!.activeGate).toBeNull();
  });
});
