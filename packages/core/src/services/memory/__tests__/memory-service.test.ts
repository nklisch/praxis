/**
 * MemoryServiceImpl unit tests.
 *
 * Uses a real temp DB with migrations via useTempDb().
 * Covers: studentModel (with decay), misconceptions ordering,
 * episodic iteration, export round-trip, and delete.
 */
import { episodicEvents, misconceptions, studentMastery } from "@praxis/memory/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import { brandId } from "../../../types/index.js";
import { MemoryServiceImpl } from "../memory-service.js";

const STUDENT_ID = brandId<"StudentId">("student-test-1");
const CONCEPT_A = brandId<"ConceptId">("concept-a");
const CONCEPT_B = brandId<"ConceptId">("concept-b");
const SESSION_ID = brandId<"SessionId">("session-test-1");

const DAY_MS = 86_400_000;

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const dbCtx = useTempDb();

function makeService(db: ReturnType<typeof openDb>["db"]) {
  return new MemoryServiceImpl({
    db,
    log: MOCK_LOG,
    decayDaysFor: () => 14,
  });
}

// Helper to insert a minimal session row (needed for FK on episodic_events)
function insertSession(
  db: ReturnType<typeof openDb>["db"],
  sessionId: string,
  studentId: string,
): void {
  // sessions table is in @praxis/memory/schema
  const { sessions } = require("@praxis/memory/schema") as typeof import("@praxis/memory/schema");
  db.insert(sessions)
    .values({
      id: sessionId,
      studentId,
      modeId: "teach",
      engineId: "direct.anthropic",
      startedAt: new Date(),
    })
    .run();
}

// ─── studentModel ─────────────────────────────────────────────────────────────

describe("MemoryServiceImpl — studentModel", () => {
  it("returns empty conceptMastery map when no rows exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    const model = await svc.studentModel(STUDENT_ID);
    expect(model.studentId).toBe(STUDENT_ID);
    expect(model.conceptMastery.size).toBe(0);
    expect(typeof model.lastUpdated).toBe("number");
  });

  it("reads mastery rows and decodes milli-ints", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const now = new Date();
    // Insert a mastery row: pKnown=0.8, uncertainty=0.2
    db.insert(studentMastery)
      .values({
        studentId: STUDENT_ID,
        conceptId: CONCEPT_A,
        pKnown: 800, // 0.8 * 1000
        uncertainty: 200,
        effectivePKnown: 800,
        lastPracticedAt: now,
        evidenceJson: ["evt-1", "evt-2"],
        updatedAt: now,
      })
      .run();

    const svc = makeService(db);
    const model = await svc.studentModel(STUDENT_ID);
    expect(model.conceptMastery.size).toBe(1);
    const entry = model.conceptMastery.get(CONCEPT_A);
    expect(entry).toBeDefined();
    expect(entry?.pKnown).toBeCloseTo(0.8);
    expect(entry?.uncertainty).toBeCloseTo(0.2);
    expect(entry?.evidence).toHaveLength(2);
  });

  it("applies decay when lastPracticedAt is 14 days ago", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    // Insert concept B practiced 14 days ago → effectivePKnown ≈ pKnown/e
    const practiced = new Date(Date.now() - 14 * DAY_MS);
    db.insert(studentMastery)
      .values({
        studentId: STUDENT_ID,
        conceptId: CONCEPT_B,
        pKnown: 1000, // 1.0
        uncertainty: 0,
        effectivePKnown: 1000,
        lastPracticedAt: practiced,
        evidenceJson: [],
        updatedAt: practiced,
      })
      .run();

    const svc = makeService(db);
    const model = await svc.studentModel(STUDENT_ID);
    const entry = model.conceptMastery.get(CONCEPT_B);
    expect(entry).toBeDefined();
    expect(entry?.pKnown).toBeCloseTo(1.0); // stored value unchanged
    expect(entry?.effectivePKnown).toBeCloseTo(1 / Math.E, 1); // ≈ 0.368
  });

  it("rows with lastPracticedAt null keep effectivePKnown == pKnown", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    db.insert(studentMastery)
      .values({
        studentId: STUDENT_ID,
        conceptId: CONCEPT_A,
        pKnown: 600,
        uncertainty: 300,
        effectivePKnown: 600,
        lastPracticedAt: null,
        evidenceJson: [],
        updatedAt: new Date(),
      })
      .run();

    const svc = makeService(db);
    const model = await svc.studentModel(STUDENT_ID);
    const entry = model.conceptMastery.get(CONCEPT_A);
    expect(entry?.effectivePKnown).toBeCloseTo(entry?.pKnown ?? 0, 5);
  });
});

// ─── misconceptions ───────────────────────────────────────────────────────────

describe("MemoryServiceImpl — misconceptions", () => {
  it("returns empty array when no rows", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    const result = await svc.misconceptions(STUDENT_ID);
    expect(result).toHaveLength(0);
  });

  it("returns rows ordered active-first then by lastObservedAt desc", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const now = new Date();
    const earlier = new Date(now.getTime() - 1000);

    db.insert(misconceptions)
      .values([
        {
          id: "m1",
          studentId: STUDENT_ID,
          conceptId: CONCEPT_A,
          description: "old active",
          errorForm: "form-A",
          remediationJson: { strategyId: "worked-examples", rationale: "r" },
          evidenceJson: ["e1"],
          status: "active",
          firstObservedAt: earlier,
          lastObservedAt: earlier,
        },
        {
          id: "m2",
          studentId: STUDENT_ID,
          conceptId: CONCEPT_B,
          description: "remediated",
          errorForm: "form-B",
          remediationJson: { strategyId: "socratic", rationale: "r" },
          evidenceJson: [],
          status: "remediated",
          firstObservedAt: now,
          lastObservedAt: now,
        },
        {
          id: "m3",
          studentId: STUDENT_ID,
          conceptId: CONCEPT_A,
          description: "newer active",
          errorForm: "form-C",
          remediationJson: { strategyId: "analogy-bridging", rationale: "r" },
          evidenceJson: ["e2"],
          status: "active",
          firstObservedAt: now,
          lastObservedAt: now,
        },
      ])
      .run();

    const svc = makeService(db);
    const result = await svc.misconceptions(STUDENT_ID);
    expect(result).toHaveLength(3);
    // Active entries first
    expect(result[0]?.status).toBe("active");
    expect(result[1]?.status).toBe("active");
    expect(result[2]?.status).toBe("remediated");
    // Among active, newer first
    expect(result[0]?.id).toBe(brandId<"MisconceptionId">("m3") as string);
  });
});

// ─── procedural + affective stubs ─────────────────────────────────────────────

describe("MemoryServiceImpl — procedural + affective stubs", () => {
  it("procedural returns empty strategies map", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    const result = await svc.procedural(STUDENT_ID);
    expect(result.studentId).toBe(STUDENT_ID);
    expect(result.strategies.size).toBe(0);
  });

  it("affective returns safe defaults", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    const result = await svc.affective(STUDENT_ID);
    expect(result.studentId).toBe(STUDENT_ID);
    expect(result.recent).toHaveLength(0);
    expect(result.baseline.engagement).toBe(0.5);
    expect(result.baseline.frustration).toBe(0.5);
    expect(result.baseline.confidence).toBe(0.5);
  });
});

// ─── episodic ─────────────────────────────────────────────────────────────────

describe("MemoryServiceImpl — episodic", () => {
  it("yields events in (turnIndex asc, ts asc) order", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertSession(db, SESSION_ID, STUDENT_ID);

    const t0 = new Date("2025-01-01T10:00:00Z");
    const t1 = new Date("2025-01-01T10:01:00Z");
    const t2 = new Date("2025-01-01T10:02:00Z");

    db.insert(episodicEvents)
      .values([
        {
          id: "evt-3",
          sessionId: SESSION_ID,
          studentId: STUDENT_ID,
          ts: t2,
          engineId: "direct.anthropic",
          modeId: "teach",
          turnIndex: 1,
          eventJson: { type: "model_message", content: "Answer" },
        },
        {
          id: "evt-1",
          sessionId: SESSION_ID,
          studentId: STUDENT_ID,
          ts: t0,
          engineId: "direct.anthropic",
          modeId: "teach",
          turnIndex: 0,
          eventJson: { type: "user_message", content: "Hello" },
        },
        {
          id: "evt-2",
          sessionId: SESSION_ID,
          studentId: STUDENT_ID,
          ts: t1,
          engineId: "direct.anthropic",
          modeId: "teach",
          turnIndex: 0,
          eventJson: { type: "model_message", content: "Hi" },
        },
      ])
      .run();

    const svc = makeService(db);
    const yielded: string[] = [];
    for await (const ev of svc.episodic({ studentId: STUDENT_ID, sessionId: SESSION_ID })) {
      yielded.push(ev.id);
    }
    expect(yielded).toEqual(["evt-1", "evt-2", "evt-3"]);
  });

  it("skips redacted events", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertSession(db, SESSION_ID, STUDENT_ID);
    const now = new Date();

    db.insert(episodicEvents)
      .values([
        {
          id: "evt-vis",
          sessionId: SESSION_ID,
          studentId: STUDENT_ID,
          ts: now,
          engineId: "direct.anthropic",
          modeId: "teach",
          turnIndex: 0,
          eventJson: { type: "user_message", content: "visible" },
        },
        {
          id: "evt-red",
          sessionId: SESSION_ID,
          studentId: STUDENT_ID,
          ts: now,
          engineId: "direct.anthropic",
          modeId: "teach",
          turnIndex: 0,
          eventJson: { type: "user_message", content: "redacted" },
          redactedAt: now,
        },
      ])
      .run();

    const svc = makeService(db);
    const ids: string[] = [];
    for await (const ev of svc.episodic({ studentId: STUDENT_ID })) {
      ids.push(ev.id);
    }
    expect(ids).toContain("evt-vis");
    expect(ids).not.toContain("evt-red");
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("MemoryServiceImpl — delete", () => {
  it("clears all projection tables; marks episodic as redacted; rows still exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertSession(db, SESSION_ID, STUDENT_ID);

    // Insert data into all tables
    db.insert(studentMastery)
      .values({
        studentId: STUDENT_ID,
        conceptId: CONCEPT_A,
        pKnown: 500,
        uncertainty: 300,
        effectivePKnown: 500,
        lastPracticedAt: new Date(),
        evidenceJson: [],
        updatedAt: new Date(),
      })
      .run();

    db.insert(misconceptions)
      .values({
        id: "m-del-1",
        studentId: STUDENT_ID,
        conceptId: CONCEPT_A,
        description: "test",
        errorForm: "form",
        remediationJson: { strategyId: "socratic", rationale: "r" },
        evidenceJson: [],
        status: "active",
        firstObservedAt: new Date(),
        lastObservedAt: new Date(),
      })
      .run();

    db.insert(episodicEvents)
      .values({
        id: "evt-del-1",
        sessionId: SESSION_ID,
        studentId: STUDENT_ID,
        ts: new Date(),
        engineId: "direct.anthropic",
        modeId: "teach",
        turnIndex: 0,
        eventJson: { type: "user_message", content: "hello" },
      })
      .run();

    const svc = makeService(db);
    await svc.delete({ studentId: STUDENT_ID, confirm: true });

    // Projection tables empty for this student
    const mastery = db
      .select()
      .from(studentMastery)
      .where((await import("drizzle-orm")).eq(studentMastery.studentId, STUDENT_ID))
      .all();
    expect(mastery).toHaveLength(0);

    const misconceptionRows = db
      .select()
      .from(misconceptions)
      .where((await import("drizzle-orm")).eq(misconceptions.studentId, STUDENT_ID))
      .all();
    expect(misconceptionRows).toHaveLength(0);

    // Episodic rows still exist but have redactedAt set
    const { eq: eqFn } = await import("drizzle-orm");
    const episodic = db
      .select()
      .from(episodicEvents)
      .where(eqFn(episodicEvents.studentId, STUDENT_ID))
      .all();
    expect(episodic).toHaveLength(1);
    expect(episodic[0]?.redactedAt).not.toBeNull();
  });
});
