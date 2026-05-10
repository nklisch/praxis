/**
 * ProceduralIndexer + scoreSessionOutcome unit tests.
 *
 * Uses a real temp DB via useTempDb() and stub deps for courseStateReader
 * and pedagogyPack. Covers all acceptance criteria from the story design.
 */

import { proceduralStrategies } from "@praxis/memory/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import type {
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  IndexerContext,
  PedagogyPackService,
  StrategyId,
  StudentId,
  Timestamp,
} from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import { ProceduralIndexer, scoreSessionOutcome } from "../procedural-indexer.js";

// ── Test constants ─────────────────────────────────────────────────────────────

const STUDENT_ID = brandId<"StudentId">("student-procedural-test");
const SESSION_ID = brandId<"SessionId">("session-procedural-test");
const COURSE_ID = brandId<"CourseId">("course-proc-1");
const LESSON_ID = brandId<"LessonId">("lesson-proc-1");
const KNOWN_STRATEGY_ID = brandId<"StrategyId">("worked-examples");
const UNKNOWN_STRATEGY_ID = brandId<"StrategyId">("mystery-strategy");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const dbCtx = useTempDb();

// ── Stub factories ─────────────────────────────────────────────────────────────

/** A PedagogyPackService that knows only KNOWN_STRATEGY_ID. */
function makePackService(): PedagogyPackService {
  return {
    current: () => null,
    listStrategies: () => [],
    getStrategy: (id: StrategyId) => {
      if (id === KNOWN_STRATEGY_ID) {
        // biome-ignore lint/suspicious/noExplicitAny: test stub — shape not needed
        return { id, name: "Worked Examples" } as any;
      }
      return null;
    },
    listTechniques: () => [],
    getTechnique: () => null,
    listMetacognitivePrompts: () => [],
  };
}

/** A PedagogyPackService where every strategy is unknown. */
function makeEmptyPackService(): PedagogyPackService {
  return {
    current: () => null,
    listStrategies: () => [],
    getStrategy: () => null,
    listTechniques: () => [],
    getTechnique: () => null,
    listMetacognitivePrompts: () => [],
  };
}

/** A CourseStateReader that returns a snapshot with the given strategy. */
function makeCourseStateReader(
  strategyId: StrategyId = KNOWN_STRATEGY_ID,
): CourseStateReader {
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
        id: LESSON_ID,
        courseId: COURSE_ID,
        title: "Lesson 1",
        conceptIds: [],
        references: [],
        suggestedStrategy: strategyId,
        estimatedMinutes: 45,
      },
    ],
    currentLesson: {
      id: LESSON_ID,
      courseId: COURSE_ID,
      title: "Lesson 1",
      conceptIds: [],
      references: [],
      suggestedStrategy: strategyId,
      estimatedMinutes: 45,
    },
    conceptsByLesson: new Map(),
    conceptsById: new Map(),
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

/** A CourseStateReader that returns null (no course state available). */
function makeNullCourseStateReader(): CourseStateReader {
  return {
    async read() {
      return null;
    },
  };
}

/** A CourseStateReader that returns a snapshot with no current lesson. */
function makeNoLessonCourseStateReader(): CourseStateReader {
  return {
    async read(_input: { studentId: StudentId; courseId: CourseId }) {
      return {
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
        conceptsByLesson: new Map(),
        conceptsById: new Map(),
        gates: [],
        activeGate: null,
        visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
      };
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

function makeIndexer(
  db: ReturnType<typeof openDb>["db"],
  opts?: {
    courseStateReader?: CourseStateReader;
    pedagogyPack?: PedagogyPackService;
    sessionCourseId?: (id: string) => string | null;
  },
): ProceduralIndexer {
  return new ProceduralIndexer({
    db,
    log: MOCK_LOG,
    sessionCourseId: opts?.sessionCourseId ?? (() => COURSE_ID),
    courseStateReader: opts?.courseStateReader ?? makeCourseStateReader(),
    pedagogyPack: opts?.pedagogyPack ?? makePackService(),
  });
}

function getRow(db: ReturnType<typeof openDb>["db"]) {
  return db
    .select()
    .from(proceduralStrategies)
    .where(
      and(
        eq(proceduralStrategies.studentId, STUDENT_ID),
        eq(proceduralStrategies.strategyId, KNOWN_STRATEGY_ID),
      ),
    )
    .get();
}

// ── Guard conditions ───────────────────────────────────────────────────────────

describe("ProceduralIndexer — guard conditions", () => {
  it("no events (< 2) → no write", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    await indexer.run(makeCtx([]));
    await indexer.run(makeCtx([makeEvent("e1", 0, { type: "user_message", content: "hi" })]));

    expect(getRow(db)).toBeUndefined();
  });

  it("no course bound → no write", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db, { sessionCourseId: () => null });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);
    expect(getRow(db)).toBeUndefined();
  });

  it("no current lesson → no write", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db, { courseStateReader: makeNoLessonCourseStateReader() });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);
    expect(getRow(db)).toBeUndefined();
  });

  it("no course state at all → no write", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db, { courseStateReader: makeNullCourseStateReader() });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);
    expect(getRow(db)).toBeUndefined();
  });

  it("lesson references unknown strategy → no write + debug log", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const debugSpy = vi.spyOn(MOCK_LOG, "debug");

    const indexer = makeIndexer(db, {
      courseStateReader: makeCourseStateReader(UNKNOWN_STRATEGY_ID),
      pedagogyPack: makeEmptyPackService(),
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

    expect(getRow(db)).toBeUndefined();
    expect(debugSpy).toHaveBeenCalledWith("procedural.unknown_strategy", {
      strategyId: UNKNOWN_STRATEGY_ID,
    });
  });

  it("mixed outcome net=0 → no write", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    // 1 correct + 1 incorrect → net = 0
    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
      makeEvent("e3", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c2" }),
      makeEvent("e4", 0, {
        type: "tool_result",
        callId: "c2",
        result: { ok: true, value: { correct: false }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);
    expect(getRow(db)).toBeUndefined();
  });
});

// ── Scoring: all-correct ────────────────────────────────────────────────────────

describe("ProceduralIndexer — all-correct session", () => {
  it("3 correct grade_math: preferenceMilli = +150, evidenceCount = 3", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    const events: IndexerContext["events"][number][] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(`tc-${i}`, i, {
          type: "tool_call",
          toolName: "grade_math",
          args: {},
          callId: `c-${i}`,
        }),
        makeEvent(`tr-${i}`, i, {
          type: "tool_result",
          callId: `c-${i}`,
          result: { ok: true, value: { correct: true }, tier: "deterministic" },
        }),
      );
    }

    await indexer.run(makeCtx(events));

    const row = getRow(db);
    expect(row).toBeDefined();
    expect(row?.preferenceMilli).toBe(150); // 3 * 50
    expect(row?.evidenceCount).toBe(3);
  });

  it("course.mark_studied counts as correct", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    const ctx = makeCtx([
      makeEvent("e1", 0, {
        type: "tool_call",
        toolName: "course.mark_studied",
        args: { conceptId: "concept-x" },
        callId: "c1",
      }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { lessonComplete: false }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);

    const row = getRow(db);
    expect(row).toBeDefined();
    expect(row?.preferenceMilli).toBe(50); // 1 correct * 50
    expect(row?.evidenceCount).toBe(1);
  });

  it("code_sandbox exitCode=0 + empty stderr counts as correct", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    const ctx = makeCtx([
      makeEvent("e1", 0, {
        type: "tool_call",
        toolName: "code_sandbox",
        args: {},
        callId: "c1",
      }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: {
          ok: true,
          value: { exitCode: 0, stderr: "", stdout: "ok", timedOut: false, durationMs: 10 },
          tier: "deterministic",
        },
      }),
    ]);

    await indexer.run(ctx);

    const row = getRow(db);
    expect(row).toBeDefined();
    expect(row?.preferenceMilli).toBe(50);
    expect(row?.evidenceCount).toBe(1);
  });
});

// ── Scoring: all-incorrect ────────────────────────────────────────────────────

describe("ProceduralIndexer — all-incorrect session", () => {
  it("2 incorrect grade_math: preferenceMilli = -200 (loss aversion 2x), evidenceCount = 2", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    const events: IndexerContext["events"][number][] = [];
    for (let i = 0; i < 2; i++) {
      events.push(
        makeEvent(`tc-${i}`, i, {
          type: "tool_call",
          toolName: "grade_math",
          args: {},
          callId: `c-${i}`,
        }),
        makeEvent(`tr-${i}`, i, {
          type: "tool_result",
          callId: `c-${i}`,
          result: { ok: true, value: { correct: false }, tier: "deterministic" },
        }),
      );
    }

    await indexer.run(makeCtx(events));

    const row = getRow(db);
    expect(row).toBeDefined();
    // net=-2 → delta = -2 * 50 * 2 (loss aversion) = -200
    expect(row?.preferenceMilli).toBe(-200);
    expect(row?.evidenceCount).toBe(2);
  });

  it("code_sandbox exitCode=1 counts as incorrect", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    const ctx = makeCtx([
      makeEvent("e1", 0, {
        type: "tool_call",
        toolName: "code_sandbox",
        args: {},
        callId: "c1",
      }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: {
          ok: true,
          value: { exitCode: 1, stderr: "error", stdout: "", timedOut: false, durationMs: 10 },
          tier: "deterministic",
        },
      }),
    ]);

    await indexer.run(ctx);

    const row = getRow(db);
    expect(row).toBeDefined();
    // net=-1 → delta = -1 * 50 * 2 = -100
    expect(row?.preferenceMilli).toBe(-100);
    expect(row?.evidenceCount).toBe(1);
  });
});

// ── Upsert + clamping ─────────────────────────────────────────────────────────

describe("ProceduralIndexer — upsert with existing row", () => {
  it("adds delta to existing preferenceMilli and sums evidenceCount", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    // Seed an existing row.
    db.insert(proceduralStrategies)
      .values({
        studentId: STUDENT_ID,
        strategyId: KNOWN_STRATEGY_ID,
        preferenceMilli: 200,
        evidenceCount: 5,
        updatedAt: new Date(),
      })
      .run();

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ]);

    await indexer.run(ctx);

    const row = getRow(db);
    expect(row?.preferenceMilli).toBe(250); // 200 + 50
    expect(row?.evidenceCount).toBe(6); // 5 + 1
  });

  it("clamps at +1000 (existing 950 + delta 200 → 1000)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    db.insert(proceduralStrategies)
      .values({
        studentId: STUDENT_ID,
        strategyId: KNOWN_STRATEGY_ID,
        preferenceMilli: 950,
        evidenceCount: 20,
        updatedAt: new Date(),
      })
      .run();

    // 4 correct → delta = +200
    const events: IndexerContext["events"][number][] = [];
    for (let i = 0; i < 4; i++) {
      events.push(
        makeEvent(`tc-${i}`, i, {
          type: "tool_call",
          toolName: "grade_math",
          args: {},
          callId: `c-${i}`,
        }),
        makeEvent(`tr-${i}`, i, {
          type: "tool_result",
          callId: `c-${i}`,
          result: { ok: true, value: { correct: true }, tier: "deterministic" },
        }),
      );
    }

    await indexer.run(makeCtx(events));

    const row = getRow(db);
    expect(row?.preferenceMilli).toBe(1000); // clamped
    expect(row?.evidenceCount).toBe(24);
  });

  it("clamps at -1000 (existing -950 + delta -300 → -1000)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    db.insert(proceduralStrategies)
      .values({
        studentId: STUDENT_ID,
        strategyId: KNOWN_STRATEGY_ID,
        preferenceMilli: -950,
        evidenceCount: 20,
        updatedAt: new Date(),
      })
      .run();

    // 3 incorrect → net = -3 → delta = -3 * 50 * 2 = -300
    const events: IndexerContext["events"][number][] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(`tc-${i}`, i, {
          type: "tool_call",
          toolName: "grade_math",
          args: {},
          callId: `c-${i}`,
        }),
        makeEvent(`tr-${i}`, i, {
          type: "tool_result",
          callId: `c-${i}`,
          result: { ok: true, value: { correct: false }, tier: "deterministic" },
        }),
      );
    }

    await indexer.run(makeCtx(events));

    const row = getRow(db);
    expect(row?.preferenceMilli).toBe(-1000); // clamped
    expect(row?.evidenceCount).toBe(23);
  });
});

// ── Per-session cap (+300 / -300) ────────────────────────────────────────────

describe("ProceduralIndexer — per-session cap", () => {
  it("7 correct → capped at +300 per session (not 7 * 50 = 350)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const indexer = makeIndexer(db);

    const events: IndexerContext["events"][number][] = [];
    for (let i = 0; i < 7; i++) {
      events.push(
        makeEvent(`tc-${i}`, i, {
          type: "tool_call",
          toolName: "grade_math",
          args: {},
          callId: `c-${i}`,
        }),
        makeEvent(`tr-${i}`, i, {
          type: "tool_result",
          callId: `c-${i}`,
          result: { ok: true, value: { correct: true }, tier: "deterministic" },
        }),
      );
    }

    await indexer.run(makeCtx(events));

    const row = getRow(db);
    // delta = min(7 * 50, 300) = 300
    expect(row?.preferenceMilli).toBe(300);
    expect(row?.evidenceCount).toBe(7);
  });
});

// ── scoreSessionOutcome pure function ─────────────────────────────────────────

describe("scoreSessionOutcome — pure function", () => {
  it("no recognized tool results → delta=0, evidenceCount=0", () => {
    const events: IndexerContext["events"] = [
      makeEvent("e1", 0, { type: "user_message", content: "hi" }),
      makeEvent("e2", 0, { type: "model_message", content: "hello" }),
    ];
    const result = scoreSessionOutcome(events);
    expect(result.delta).toBe(0);
    expect(result.evidenceCount).toBe(0);
  });

  it("tool_result with no matching tool_call → ignored", () => {
    const events: IndexerContext["events"] = [
      // No tool_call event, so the tool_result is orphaned
      makeEvent("e1", 0, {
        type: "tool_result",
        callId: "orphan",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ];
    const result = scoreSessionOutcome(events);
    expect(result.delta).toBe(0);
  });

  it("tool_result with ok=false → ignored", () => {
    const events: IndexerContext["events"] = [
      makeEvent("e1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: false, error: { code: "timeout", message: "timed out", recoverable: false } },
      }),
    ];
    const result = scoreSessionOutcome(events);
    expect(result.delta).toBe(0);
    expect(result.evidenceCount).toBe(0);
  });

  it("1 correct → delta=50, evidenceCount=1", () => {
    const events: IndexerContext["events"] = [
      makeEvent("e1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
    ];
    const result = scoreSessionOutcome(events);
    expect(result.delta).toBe(50);
    expect(result.evidenceCount).toBe(1);
  });

  it("1 incorrect → delta=-100 (loss aversion 2x), evidenceCount=1", () => {
    const events: IndexerContext["events"] = [
      makeEvent("e1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("e2", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { correct: false }, tier: "deterministic" },
      }),
    ];
    const result = scoreSessionOutcome(events);
    expect(result.delta).toBe(-100); // -1 * 50 * 2
    expect(result.evidenceCount).toBe(1);
  });

  it("2 correct, 2 incorrect → net=0, delta=0, evidenceCount=4", () => {
    const events: IndexerContext["events"] = [
      makeEvent("tc1", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c1" }),
      makeEvent("tr1", 0, {
        type: "tool_result",
        callId: "c1",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
      makeEvent("tc2", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c2" }),
      makeEvent("tr2", 0, {
        type: "tool_result",
        callId: "c2",
        result: { ok: true, value: { correct: true }, tier: "deterministic" },
      }),
      makeEvent("tc3", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c3" }),
      makeEvent("tr3", 0, {
        type: "tool_result",
        callId: "c3",
        result: { ok: true, value: { correct: false }, tier: "deterministic" },
      }),
      makeEvent("tc4", 0, { type: "tool_call", toolName: "grade_math", args: {}, callId: "c4" }),
      makeEvent("tr4", 0, {
        type: "tool_result",
        callId: "c4",
        result: { ok: true, value: { correct: false }, tier: "deterministic" },
      }),
    ];
    const result = scoreSessionOutcome(events);
    expect(result.delta).toBe(0);
    expect(result.evidenceCount).toBe(4);
  });

  it("per-session positive cap: 7 correct → delta capped at +300 (not 350)", () => {
    const events: IndexerContext["events"][number][] = [];
    for (let i = 0; i < 7; i++) {
      events.push(
        makeEvent(`tc-${i}`, i, {
          type: "tool_call",
          toolName: "grade_math",
          args: {},
          callId: `c-${i}`,
        }),
        makeEvent(`tr-${i}`, i, {
          type: "tool_result",
          callId: `c-${i}`,
          result: { ok: true, value: { correct: true }, tier: "deterministic" },
        }),
      );
    }
    const result = scoreSessionOutcome(events);
    expect(result.delta).toBe(300);
    expect(result.evidenceCount).toBe(7);
  });

  it("per-session negative cap: 4 incorrect → delta capped at -300 (not -400)", () => {
    const events: IndexerContext["events"][number][] = [];
    for (let i = 0; i < 4; i++) {
      events.push(
        makeEvent(`tc-${i}`, i, {
          type: "tool_call",
          toolName: "grade_math",
          args: {},
          callId: `c-${i}`,
        }),
        makeEvent(`tr-${i}`, i, {
          type: "tool_result",
          callId: `c-${i}`,
          result: { ok: true, value: { correct: false }, tier: "deterministic" },
        }),
      );
    }
    // 4 incorrect → net = -4 → delta = -4 * 50 * 2 = -400 → capped at -300
    const result = scoreSessionOutcome(events);
    expect(result.delta).toBe(-300);
    expect(result.evidenceCount).toBe(4);
  });
});
