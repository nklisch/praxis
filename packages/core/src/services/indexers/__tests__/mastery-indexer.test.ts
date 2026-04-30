/**
 * MasteryIndexer unit tests.
 *
 * Uses a real temp DB and a stub courseStateReader.
 * Covers all signal-extraction patterns from the design spec.
 */
import { studentMastery } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import type {
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  IndexerContext,
  StudentId,
  Timestamp,
} from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import { MasteryIndexer } from "../mastery-indexer.js";

const STUDENT_ID = brandId<"StudentId">("student-mastery-test");
const SESSION_ID = brandId<"SessionId">("session-mastery-test");
const CONCEPT_A = brandId<"ConceptId">("concept-a");
const LESSON_1 = brandId<"LessonId">("lesson-1");
const COURSE_ID = brandId<"CourseId">("course-1");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const dbCtx = useTempDb();

/** Build a stub CourseStateReader that returns CONCEPT_A as the current un-studied concept. */
function makeCourseStateReader(studiedConceptA = false): CourseStateReader {
  const snapshot: CourseStateSnapshot = {
    course: {
      id: COURSE_ID,
      studentId: STUDENT_ID,
      title: "Test Course",
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      subject: "math" as any,
      gradeLevel: "9-12",
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      source: {} as any,
      lessons: [],
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      conceptGraphId: "cg-1" as any,
      gates: [],
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      thresholds: {} as any,
      createdAt: Date.now() as Timestamp,
      updatedAt: Date.now() as Timestamp,
    },
    lessons: [
      {
        id: LESSON_1,
        courseId: COURSE_ID,
        title: "Lesson 1",
        conceptIds: [CONCEPT_A],
        references: [],
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        suggestedStrategy: "worked-examples" as any,
        estimatedMinutes: 45,
      },
    ],
    currentLesson: {
      id: LESSON_1,
      courseId: COURSE_ID,
      title: "Lesson 1",
      conceptIds: [CONCEPT_A],
      references: [],
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      suggestedStrategy: "worked-examples" as any,
      estimatedMinutes: 45,
    },
    conceptsByLesson: new Map([
      [
        LESSON_1,
        [
          {
            conceptId: CONCEPT_A,
            name: "Concept A",
            description: "A",
            studied: studiedConceptA,
            lessonId: LESSON_1,
          },
        ],
      ],
    ]),
    conceptsById: new Map([
      [
        CONCEPT_A,
        {
          conceptId: CONCEPT_A,
          name: "Concept A",
          description: "A",
          studied: studiedConceptA,
          lessonId: LESSON_1,
        },
      ],
    ]),
    // Phase 9: required fields — stub as empty for pre-Phase-9 tests.
    gates: [],
    activeGate: null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
  };

  return {
    async read(_input: { studentId: StudentId; courseId: CourseId }) {
      return snapshot;
    },
  };
}

function makeCtx(events: IndexerContext["events"]): IndexerContext {
  return { studentId: STUDENT_ID, sessionId: SESSION_ID, events, log: MOCK_LOG };
}

function makeEvent(
  id: string,
  turnIndex: number,
  event: { type: string; [k: string]: unknown },
): IndexerContext["events"][number] {
  return {
    id: brandId<"EventId">(id),
    turnIndex,
    ts: Date.now() as Timestamp,
    event: event as IndexerContext["events"][number]["event"],
  };
}

// ─── grade_math signals ──────────────────────────────────────────────────────

describe("MasteryIndexer — grade_math", () => {
  it("grade_math correct → correct signal → pKnown increases", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = new MasteryIndexer({
      db,
      log: MOCK_LOG,
      courseStateReader: makeCourseStateReader(),
      sessionCourseId: () => COURSE_ID,
    });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);

    const row = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();
    expect(row).toBeDefined();
    expect(row?.pKnown).toBeGreaterThan(100); // > 0.1 (initial prior)
    expect(row?.conceptId).toBe(CONCEPT_A);
  });

  it("grade_math incorrect → incorrect signal → pKnown decreases", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = new MasteryIndexer({
      db,
      log: MOCK_LOG,
      courseStateReader: makeCourseStateReader(),
      sessionCourseId: () => COURSE_ID,
    });

    const ctx = makeCtx([
      makeEvent("e3", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c2" }),
      makeEvent("e4", 0, {
        type: "tool_result",
        callId: "c2",
        result: { ok: true, value: { correct: false }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);

    const row = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();
    expect(row).toBeDefined();
    // pKnown starts at 0.1 (100 milli). incorrect with weight=1 from pL0=0.1 stays very low.
    expect(row?.pKnown).toBeLessThanOrEqual(100);
  });
});

// ─── course.mark_studied ──────────────────────────────────────────────────────

describe("MasteryIndexer — course.mark_studied", () => {
  it("produces a correct signal attributed to the marked conceptId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = new MasteryIndexer({
      db,
      log: MOCK_LOG,
      courseStateReader: makeCourseStateReader(),
      sessionCourseId: () => COURSE_ID,
    });

    const ctx = makeCtx([
      makeEvent("e5", 0, {
        type: "tool_call",
        toolName: "course.mark_studied",
        args: { conceptId: CONCEPT_A },
        callId: "c3",
      }),
      makeEvent("e6", 0, {
        type: "tool_result",
        callId: "c3",
        result: {
          ok: true,
          value: { lessonComplete: false, lessonId: LESSON_1 },
          tier: "deterministic",
        },
      }),
    ]);

    await indexer.run(ctx);

    const row = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();
    expect(row).toBeDefined();
    expect(row?.conceptId).toBe(CONCEPT_A);
    expect(row?.pKnown).toBeGreaterThan(100);
  });
});

// ─── update_mastery skip ─────────────────────────────────────────────────────

describe("MasteryIndexer — update_mastery active-path skip", () => {
  it("skips update_mastery tool results (active path already wrote BKT)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = new MasteryIndexer({
      db,
      log: MOCK_LOG,
      courseStateReader: makeCourseStateReader(),
      sessionCourseId: () => COURSE_ID,
    });

    const ctx = makeCtx([
      makeEvent("e7", 0, {
        type: "tool_call",
        toolName: "update_mastery",
        args: { conceptId: CONCEPT_A, signal: "correct" },
        callId: "c4",
      }),
      makeEvent("e8", 0, {
        type: "tool_result",
        callId: "c4",
        result: {
          ok: true,
          value: { conceptId: CONCEPT_A, newPKnown: 0.5, newEffectivePKnown: 0.5 },
          tier: "deterministic",
        },
      }),
    ]);

    await indexer.run(ctx);

    // Should NOT have written a row (active-path tool already wrote it).
    const row = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();
    expect(row).toBeUndefined();
  });
});

// ─── no current concept → skip ───────────────────────────────────────────────

describe("MasteryIndexer — no current concept", () => {
  it("emits no signal when session has no courseId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = new MasteryIndexer({
      db,
      log: MOCK_LOG,
      courseStateReader: makeCourseStateReader(),
      sessionCourseId: () => null, // no course
    });

    const ctx = makeCtx([
      makeEvent("e9", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c5" }),
      makeEvent("e10", 0, {
        type: "tool_result",
        callId: "c5",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);

    const row = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();
    expect(row).toBeUndefined();
  });
});

// ─── code_sandbox signals ────────────────────────────────────────────────────

describe("MasteryIndexer — code_sandbox", () => {
  it("exitCode=0 + empty stderr → correct signal", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = new MasteryIndexer({
      db,
      log: MOCK_LOG,
      courseStateReader: makeCourseStateReader(),
      sessionCourseId: () => COURSE_ID,
    });

    const ctx = makeCtx([
      makeEvent("e11", 0, { type: "tool_call", toolName: "code_sandbox", args: {}, callId: "c6" }),
      makeEvent("e12", 0, {
        type: "tool_result",
        callId: "c6",
        result: {
          ok: true,
          value: { exitCode: 0, stderr: "", stdout: "ok", timedOut: false, durationMs: 10 },
          tier: "deterministic",
        },
      }),
    ]);

    await indexer.run(ctx);

    const row = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();
    expect(row).toBeDefined();
    expect(row?.pKnown).toBeGreaterThan(100);
  });

  it("exitCode=1 → incorrect signal", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = new MasteryIndexer({
      db,
      log: MOCK_LOG,
      courseStateReader: makeCourseStateReader(),
      sessionCourseId: () => COURSE_ID,
    });

    const ctx = makeCtx([
      makeEvent("e13", 0, { type: "tool_call", toolName: "code_sandbox", args: {}, callId: "c7" }),
      makeEvent("e14", 0, {
        type: "tool_result",
        callId: "c7",
        result: {
          ok: true,
          value: { exitCode: 1, stderr: "error", stdout: "", timedOut: false, durationMs: 10 },
          tier: "deterministic",
        },
      }),
    ]);

    await indexer.run(ctx);

    const row = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();
    expect(row).toBeDefined();
    expect(row?.pKnown).toBeLessThanOrEqual(100);
  });
});

// ─── evidence cap ────────────────────────────────────────────────────────────

describe("MasteryIndexer — evidence cap", () => {
  it("evidenceJson keeps at most 50 event IDs (FIFO truncation)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = new MasteryIndexer({
      db,
      log: MOCK_LOG,
      courseStateReader: makeCourseStateReader(),
      sessionCourseId: () => COURSE_ID,
    });

    // Pre-fill mastery row with 50 evidence IDs
    db.insert(studentMastery)
      .values({
        studentId: STUDENT_ID,
        conceptId: CONCEPT_A,
        pKnown: 500,
        uncertainty: 200,
        effectivePKnown: 500,
        lastPracticedAt: new Date(),
        evidenceJson: Array.from({ length: 50 }, (_, i) => `old-evt-${i}`),
        updatedAt: new Date(),
      })
      .run();

    // Run indexer with one more signal
    const ctx = makeCtx([
      makeEvent("new-evt-1", 0, {
        type: "tool_call",
        toolName: "grade_math",
        args: {},
        callId: "c-cap",
      }),
      makeEvent("new-evt-2", 0, {
        type: "tool_result",
        callId: "c-cap",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);

    const row = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();
    const evidence = row?.evidenceJson as string[];
    expect(evidence).toHaveLength(50);
    // Most recent event should be at the end
    expect(evidence[evidence.length - 1]).toBe("new-evt-2");
    // Oldest event should have been dropped
    expect(evidence).not.toContain("old-evt-0");
  });
});

// ─── idempotency ─────────────────────────────────────────────────────────────

describe("MasteryIndexer — idempotency", () => {
  it("running twice over the same events produces the same final state", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = new MasteryIndexer({
      db,
      log: MOCK_LOG,
      courseStateReader: makeCourseStateReader(),
      sessionCourseId: () => COURSE_ID,
    });

    const ctx = makeCtx([
      makeEvent("e-idem-1", 0, {
        type: "tool_call",
        toolName: "grade_math",
        args: {},
        callId: "c-idem",
      }),
      makeEvent("e-idem-2", 0, {
        type: "tool_result",
        callId: "c-idem",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);
    const row1 = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();

    // Reset to initial state to simulate a re-run (in practice the turnFloor prevents this)
    db.delete(studentMastery).where(eq(studentMastery.studentId, STUDENT_ID)).run();
    await indexer.run(ctx);
    const row2 = db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, STUDENT_ID))
      .get();

    expect(row1?.pKnown).toBe(row2?.pKnown);
    expect(row1?.uncertainty).toBe(row2?.uncertainty);
  });
});
