/**
 * MisconceptionIndexer unit tests.
 *
 * Uses a real temp DB + FakeEngine pattern (matching bootstrap-service.test.ts).
 * Covers: empty session skip, valid insert, dedup on re-run, unknown conceptId
 * dropped, engine error aborts gracefully.
 */
import { misconceptions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import type {
  CourseStateReader,
  CourseStateSnapshot,
  Engine,
  EngineEvent,
  IndexerContext,
  Timestamp,
} from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import { MisconceptionIndexer } from "../misconception-indexer.js";

const STUDENT_ID = brandId<"StudentId">("student-misc-test");
const SESSION_ID = brandId<"SessionId">("session-misc-test");
const CONCEPT_A = brandId<"ConceptId">("concept-a");
const CONCEPT_B = brandId<"ConceptId">("concept-b");
const LESSON_1 = brandId<"LessonId">("lesson-1");
const COURSE_ID = brandId<"CourseId">("course-misc-1");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const dbCtx = useTempDb();

// ── FakeEngine helpers ────────────────────────────────────────────────────────

function makeFakeEngine(events: EngineEvent[]): Engine {
  const handle = {
    id: "fake-session",
    send: vi.fn().mockImplementation(async function* () {
      for (const ev of events) yield ev;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    id: "fake-engine",
    kind: "single-shot" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn().mockResolvedValue(handle),
  } as unknown as Engine;
}

function makeMisconceptionJson(
  entries: Array<{
    conceptId: string;
    description: string;
    errorForm: string;
    strategyId?: string;
    evidenceEventIds?: string[];
  }>,
): string {
  const arr = entries.map((e) => ({
    conceptId: e.conceptId,
    description: e.description,
    errorForm: e.errorForm,
    remediation: {
      strategyId: e.strategyId ?? "worked-examples",
      rationale: "test rationale",
    },
    evidenceEventIds: e.evidenceEventIds ?? ["evt-evidence"],
  }));
  return `\`\`\`json\n${JSON.stringify(arr)}\n\`\`\``;
}

// ── CourseStateReader stub ────────────────────────────────────────────────────

function makeCourseStateReader(): CourseStateReader {
  const snapshot: CourseStateSnapshot = {
    course: {
      id: COURSE_ID,
      studentId: STUDENT_ID,
      title: "Test",
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
    lessons: [],
    currentLesson: null,
    conceptsByLesson: new Map([
      [
        LESSON_1,
        [
          {
            conceptId: CONCEPT_A,
            name: "Concept A",
            description: "",
            studied: false,
            lessonId: LESSON_1,
          },
          {
            conceptId: CONCEPT_B,
            name: "Concept B",
            description: "",
            studied: false,
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
          description: "",
          studied: false,
          lessonId: LESSON_1,
        },
      ],
      [
        CONCEPT_B,
        {
          conceptId: CONCEPT_B,
          name: "Concept B",
          description: "",
          studied: false,
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
    async read() {
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
  event: EngineEvent,
): IndexerContext["events"][number] {
  return { id: brandId<"EventId">(id), turnIndex, ts: Date.now() as Timestamp, event };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MisconceptionIndexer — empty session skip", () => {
  it("returns immediately with fewer than 2 events; no DB write", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine([
      {
        type: "model_message",
        content: makeMisconceptionJson([
          { conceptId: CONCEPT_A, description: "d", errorForm: "f" },
        ]),
      },
    ]);

    const indexer = new MisconceptionIndexer({
      db,
      log: MOCK_LOG,
      engineResolver: () => engine,
      sessionCourseId: () => COURSE_ID,
      courseStateReader: makeCourseStateReader(),
    });

    const ctx = makeCtx([makeEvent("single-evt", 0, { type: "user_message", content: "hello" })]);
    await indexer.run(ctx);

    // Engine should NOT have been called
    expect(engine.open).not.toHaveBeenCalled();

    const rows = db
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, STUDENT_ID))
      .all();
    expect(rows).toHaveLength(0);
  });
});

describe("MisconceptionIndexer — valid misconception insert", () => {
  it("inserts a misconception row attributed to the correct conceptId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine([
      {
        type: "model_message",
        content: makeMisconceptionJson([
          {
            conceptId: CONCEPT_A,
            description: "Student confuses X with Y",
            errorForm: "x-as-y",
            evidenceEventIds: ["evt-evidence-1"],
          },
        ]),
      },
      { type: "final", usage: { inputTokens: 100, outputTokens: 50 } },
    ]);

    const indexer = new MisconceptionIndexer({
      db,
      log: MOCK_LOG,
      engineResolver: () => engine,
      sessionCourseId: () => COURSE_ID,
      courseStateReader: makeCourseStateReader(),
    });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "user_message", content: "question" }),
      makeEvent("e2", 1, { type: "model_message", content: "answer" }),
    ]);
    await indexer.run(ctx);

    const rows = db
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, STUDENT_ID))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.conceptId).toBe(CONCEPT_A);
    expect(rows[0]?.errorForm).toBe("x-as-y");
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]?.evidenceJson as string[]).toContain("evt-evidence-1");
  });
});

describe("MisconceptionIndexer — dedup on re-run", () => {
  it("re-running on same session appends evidence; no duplicate row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    const makeIndexer = (evidenceId: string) => {
      const engine = makeFakeEngine([
        {
          type: "model_message",
          content: makeMisconceptionJson([
            {
              conceptId: CONCEPT_A,
              description: "desc",
              errorForm: "same-form",
              evidenceEventIds: [evidenceId],
            },
          ]),
        },
      ]);
      return new MisconceptionIndexer({
        db,
        log: MOCK_LOG,
        engineResolver: () => engine,
        sessionCourseId: () => COURSE_ID,
        courseStateReader: makeCourseStateReader(),
      });
    };

    const ctx = makeCtx([
      makeEvent("e-dup-1", 0, { type: "user_message", content: "q1" }),
      makeEvent("e-dup-2", 1, { type: "model_message", content: "a1" }),
    ]);

    await makeIndexer("evidence-run-1").run(ctx);
    await makeIndexer("evidence-run-2").run(ctx);

    const rows = db
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, STUDENT_ID))
      .all();
    // Only one row
    expect(rows).toHaveLength(1);
    // Evidence merged
    const evidence = rows[0]?.evidenceJson as string[];
    expect(evidence).toContain("evidence-run-1");
    expect(evidence).toContain("evidence-run-2");
  });
});

describe("MisconceptionIndexer — unknown conceptId dropped", () => {
  it("drops entries with unknown conceptId and logs a warn", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine([
      {
        type: "model_message",
        content: makeMisconceptionJson([
          {
            conceptId: "not-in-catalog",
            description: "desc",
            errorForm: "some-form",
            evidenceEventIds: ["evt-unknown"],
          },
        ]),
      },
    ]);

    const indexer = new MisconceptionIndexer({
      db,
      log: MOCK_LOG,
      engineResolver: () => engine,
      sessionCourseId: () => COURSE_ID,
      courseStateReader: makeCourseStateReader(),
    });

    const ctx = makeCtx([
      makeEvent("e-unk-1", 0, { type: "user_message", content: "q" }),
      makeEvent("e-unk-2", 1, { type: "model_message", content: "a" }),
    ]);
    await indexer.run(ctx);

    const rows = db
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, STUDENT_ID))
      .all();
    expect(rows).toHaveLength(0);
    expect(MOCK_LOG.warn).toHaveBeenCalledWith(
      "misconception.unknown_concept_id",
      expect.anything(),
    );
  });
});

describe("MisconceptionIndexer — engine error aborts gracefully", () => {
  it("logs warn and makes no DB writes when engine emits an error event", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engineError: EngineEvent = {
      type: "error",
      error: { code: "engine.timeout", message: "timed out", recoverable: false },
    };
    const engine = makeFakeEngine([engineError]);

    const indexer = new MisconceptionIndexer({
      db,
      log: MOCK_LOG,
      engineResolver: () => engine,
      sessionCourseId: () => COURSE_ID,
      courseStateReader: makeCourseStateReader(),
    });

    const ctx = makeCtx([
      makeEvent("e-err-1", 0, { type: "user_message", content: "q" }),
      makeEvent("e-err-2", 1, { type: "model_message", content: "a" }),
    ]);
    await indexer.run(ctx);

    const rows = db
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, STUDENT_ID))
      .all();
    expect(rows).toHaveLength(0);
    expect(MOCK_LOG.warn).toHaveBeenCalledWith("misconception.engine_error", expect.anything());
  });
});

describe("MisconceptionIndexer — no courseId skip", () => {
  it("returns immediately when sessionCourseId returns null", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine([]);

    const indexer = new MisconceptionIndexer({
      db,
      log: MOCK_LOG,
      engineResolver: () => engine,
      sessionCourseId: () => null,
      courseStateReader: makeCourseStateReader(),
    });

    const ctx = makeCtx([
      makeEvent("e-nc-1", 0, { type: "user_message", content: "q" }),
      makeEvent("e-nc-2", 1, { type: "model_message", content: "a" }),
    ]);
    await indexer.run(ctx);

    expect(engine.open).not.toHaveBeenCalled();
    const rows = db.select().from(misconceptions).all();
    expect(rows).toHaveLength(0);
  });
});
