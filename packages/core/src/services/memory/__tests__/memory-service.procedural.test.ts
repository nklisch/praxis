/**
 * MemoryServiceImpl.procedural() read-path tests.
 *
 * Covers: empty state, populated state with mixed positive/negative preferences,
 * DB round-trip (rows persist across service instances).
 *
 * Uses a real temp SQLite DB via useTempDb().
 */

import { proceduralStrategies } from "@praxis/memory/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import type { StrategyId, StudentId } from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import { MemoryServiceImpl } from "../memory-service.js";

const STUDENT_ID = brandId<"StudentId">("student-procedural-read");
const OTHER_STUDENT_ID = brandId<"StudentId">("student-other-proc");

const STRATEGY_A = brandId<"StrategyId">("worked-examples");
const STRATEGY_B = brandId<"StrategyId">("socratic-dialogue");
const STRATEGY_C = brandId<"StrategyId">("problem-based");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const dbCtx = useTempDb();

function makeService(db: ReturnType<typeof openDb>["db"]) {
  return new MemoryServiceImpl({ db, log: MOCK_LOG, decayDaysFor: () => 14 });
}

function insertStrategy(
  db: ReturnType<typeof openDb>["db"],
  opts: {
    studentId: StudentId;
    strategyId: StrategyId;
    preferenceMilli: number;
    evidenceCount: number;
  },
) {
  db.insert(proceduralStrategies)
    .values({
      studentId: opts.studentId,
      strategyId: opts.strategyId,
      preferenceMilli: opts.preferenceMilli,
      evidenceCount: opts.evidenceCount,
      updatedAt: new Date(),
    })
    .run();
}

// ── Empty state ────────────────────────────────────────────────────────────────

describe("MemoryService.procedural — empty state", () => {
  it("returns empty strategies Map when no rows exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    const result = await service.procedural(STUDENT_ID);

    expect(result.studentId).toBe(STUDENT_ID);
    expect(result.strategies.size).toBe(0);
  });

  it("does not return strategies from other students", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    insertStrategy(db, {
      studentId: OTHER_STUDENT_ID,
      strategyId: STRATEGY_A,
      preferenceMilli: 500,
      evidenceCount: 3,
    });

    const result = await service.procedural(STUDENT_ID);

    expect(result.strategies.size).toBe(0);
  });
});

// ── Populated state ────────────────────────────────────────────────────────────

describe("MemoryService.procedural — populated state", () => {
  it("returns all strategies as a Map keyed by StrategyId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    insertStrategy(db, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_A,
      preferenceMilli: 750,
      evidenceCount: 10,
    });
    insertStrategy(db, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_B,
      preferenceMilli: -300,
      evidenceCount: 5,
    });
    insertStrategy(db, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_C,
      preferenceMilli: 0,
      evidenceCount: 2,
    });

    const result = await service.procedural(STUDENT_ID);

    expect(result.strategies.size).toBe(3);
    expect(result.strategies.has(STRATEGY_A)).toBe(true);
    expect(result.strategies.has(STRATEGY_B)).toBe(true);
    expect(result.strategies.has(STRATEGY_C)).toBe(true);
  });

  it("converts preferenceMilli to preference in [-1, 1]", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    insertStrategy(db, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_A,
      preferenceMilli: 1000,
      evidenceCount: 5,
    });
    insertStrategy(db, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_B,
      preferenceMilli: -500,
      evidenceCount: 3,
    });
    insertStrategy(db, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_C,
      preferenceMilli: 0,
      evidenceCount: 1,
    });

    const result = await service.procedural(STUDENT_ID);

    const a = result.strategies.get(STRATEGY_A);
    const b = result.strategies.get(STRATEGY_B);
    const c = result.strategies.get(STRATEGY_C);

    expect(a?.preference).toBeCloseTo(1.0, 5);
    expect(b?.preference).toBeCloseTo(-0.5, 5);
    expect(c?.preference).toBeCloseTo(0.0, 5);
  });

  it("preserves evidenceCount from DB rows", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    insertStrategy(db, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_A,
      preferenceMilli: 200,
      evidenceCount: 42,
    });

    const result = await service.procedural(STUDENT_ID);

    const pref = result.strategies.get(STRATEGY_A);
    expect(pref?.evidenceCount).toBe(42);
  });

  it("strategyId field on StrategyPreference matches the Map key", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    insertStrategy(db, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_A,
      preferenceMilli: 100,
      evidenceCount: 1,
    });

    const result = await service.procedural(STUDENT_ID);

    const pref = result.strategies.get(STRATEGY_A);
    expect(pref?.strategyId).toBe(STRATEGY_A);
  });
});

// ── DB round-trip ─────────────────────────────────────────────────────────────

describe("MemoryService.procedural — DB round-trip", () => {
  it("rows persist across separate service instances (same DB path)", async () => {
    const { db: db1 } = openDb({ path: dbCtx.dbPath });
    const service1 = makeService(db1);

    // Write via a different path (direct insert to simulate prior indexer run).
    insertStrategy(db1, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_A,
      preferenceMilli: 350,
      evidenceCount: 7,
    });
    insertStrategy(db1, {
      studentId: STUDENT_ID,
      strategyId: STRATEGY_B,
      preferenceMilli: -150,
      evidenceCount: 3,
    });

    // Open a fresh service instance over the same path.
    const { db: db2 } = openDb({ path: dbCtx.dbPath });
    const service2 = makeService(db2);

    const result = await service2.procedural(STUDENT_ID);

    expect(result.strategies.size).toBe(2);

    const a = result.strategies.get(STRATEGY_A);
    expect(a?.preference).toBeCloseTo(0.35, 5);
    expect(a?.evidenceCount).toBe(7);

    const b = result.strategies.get(STRATEGY_B);
    expect(b?.preference).toBeCloseTo(-0.15, 5);
    expect(b?.evidenceCount).toBe(3);

    // Verify the stub (service1) also sees the same data for completeness.
    const result1 = await service1.procedural(STUDENT_ID);
    expect(result1.strategies.size).toBe(2);
  });
});
