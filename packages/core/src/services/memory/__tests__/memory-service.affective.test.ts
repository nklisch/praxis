/**
 * MemoryServiceImpl.affective() read-path tests.
 *
 * Covers: empty state, populated state (ordering), baseline math,
 * RECENT_LIMIT=20 cap, BASELINE_WINDOW=50 averaging, mixed sources.
 *
 * Uses a real temp SQLite DB via useTempDb().
 */
import { affectiveSamples } from "@praxis/memory/schema";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import { brandId } from "../../../types/index.js";
import { MemoryServiceImpl } from "../memory-service.js";

const STUDENT_ID = brandId<"StudentId">("student-affective-read");
const OTHER_STUDENT_ID = brandId<"StudentId">("student-other");

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

/**
 * Insert an affective sample row. ts should be a Date or number (ms since epoch).
 */
function insertSample(
  db: ReturnType<typeof openDb>["db"],
  opts: {
    studentId: string;
    ts: Date;
    source: "model-inferred" | "explicit-checkin";
    engagementMilli: number;
    frustrationMilli: number;
    confidenceMilli: number;
  },
): void {
  db.insert(affectiveSamples)
    .values({
      id: uuidv7(),
      studentId: opts.studentId,
      ts: opts.ts,
      source: opts.source,
      engagementMilli: opts.engagementMilli,
      frustrationMilli: opts.frustrationMilli,
      confidenceMilli: opts.confidenceMilli,
    })
    .run();
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe("MemoryService.affective — empty state", () => {
  it("returns neutral 0.5 baseline and empty recent when no rows exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    const result = await service.affective(STUDENT_ID);

    expect(result.studentId).toBe(STUDENT_ID);
    expect(result.recent).toHaveLength(0);
    expect(result.baseline.engagement).toBe(0.5);
    expect(result.baseline.frustration).toBe(0.5);
    expect(result.baseline.confidence).toBe(0.5);
  });

  it("does not return samples from other students", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    // Insert a sample for a different student
    insertSample(db, {
      studentId: OTHER_STUDENT_ID,
      ts: new Date(),
      source: "model-inferred",
      engagementMilli: 800,
      frustrationMilli: 200,
      confidenceMilli: 700,
    });

    const result = await service.affective(STUDENT_ID);

    expect(result.recent).toHaveLength(0);
    expect(result.baseline.engagement).toBe(0.5); // neutral default
  });
});

// ── Populated state ───────────────────────────────────────────────────────────

describe("MemoryService.affective — populated state", () => {
  it("returns samples in descending timestamp order (most recent first)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    const base = Date.now();
    insertSample(db, {
      studentId: STUDENT_ID,
      ts: new Date(base + 1000), // newest
      source: "model-inferred",
      engagementMilli: 900,
      frustrationMilli: 100,
      confidenceMilli: 800,
    });
    insertSample(db, {
      studentId: STUDENT_ID,
      ts: new Date(base), // older
      source: "explicit-checkin",
      engagementMilli: 500,
      frustrationMilli: 500,
      confidenceMilli: 600,
    });

    const result = await service.affective(STUDENT_ID);

    expect(result.recent).toHaveLength(2);
    // Most recent first
    expect(result.recent[0]?.ts).toBeGreaterThan(result.recent[1]?.ts as number);
    expect(result.recent[0]?.source).toBe("model-inferred");
    expect(result.recent[1]?.source).toBe("explicit-checkin");
  });

  it("converts milli-integers back to 0..1 floats correctly", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    insertSample(db, {
      studentId: STUDENT_ID,
      ts: new Date(),
      source: "model-inferred",
      engagementMilli: 750,
      frustrationMilli: 250,
      confidenceMilli: 500,
    });

    const result = await service.affective(STUDENT_ID);

    expect(result.recent).toHaveLength(1);
    const sample = result.recent[0];
    expect(sample?.engagement).toBeCloseTo(0.75, 5);
    expect(sample?.frustration).toBeCloseTo(0.25, 5);
    expect(sample?.confidence).toBeCloseTo(0.5, 5);
  });

  it("caps recent at 20 samples (RECENT_LIMIT)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    const base = Date.now();
    // Insert 25 samples with staggered timestamps
    for (let i = 0; i < 25; i++) {
      insertSample(db, {
        studentId: STUDENT_ID,
        ts: new Date(base + i * 1000),
        source: "model-inferred",
        engagementMilli: 500,
        frustrationMilli: 500,
        confidenceMilli: 500,
      });
    }

    const result = await service.affective(STUDENT_ID);

    expect(result.recent).toHaveLength(20);
    // Baseline still averages all 25 rows (up to 50)
    expect(result.baseline.engagement).toBeCloseTo(0.5, 5);
  });
});

// ── Baseline math ─────────────────────────────────────────────────────────────

describe("MemoryService.affective — baseline math", () => {
  it("averages all rows for baseline when fewer than BASELINE_WINDOW exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    const base = Date.now();
    // Insert 3 samples with known values
    insertSample(db, {
      studentId: STUDENT_ID,
      ts: new Date(base),
      source: "model-inferred",
      engagementMilli: 1000,
      frustrationMilli: 0,
      confidenceMilli: 1000,
    });
    insertSample(db, {
      studentId: STUDENT_ID,
      ts: new Date(base + 1000),
      source: "model-inferred",
      engagementMilli: 0,
      frustrationMilli: 1000,
      confidenceMilli: 0,
    });
    insertSample(db, {
      studentId: STUDENT_ID,
      ts: new Date(base + 2000),
      source: "explicit-checkin",
      engagementMilli: 500,
      frustrationMilli: 500,
      confidenceMilli: 500,
    });

    const result = await service.affective(STUDENT_ID);

    // Average: (1000 + 0 + 500) / 3 / 1000 = 0.5
    expect(result.baseline.engagement).toBeCloseTo(0.5, 5);
    // Average: (0 + 1000 + 500) / 3 / 1000 = 0.5
    expect(result.baseline.frustration).toBeCloseTo(0.5, 5);
    // Average: (1000 + 0 + 500) / 3 / 1000 = 0.5
    expect(result.baseline.confidence).toBeCloseTo(0.5, 5);
  });

  it("baseline uses the most recent BASELINE_WINDOW (50) rows, not all rows", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    const base = Date.now();
    // Insert 60 old rows with engagementMilli=0 (should be excluded from baseline)
    for (let i = 0; i < 60; i++) {
      insertSample(db, {
        studentId: STUDENT_ID,
        ts: new Date(base + i * 1000), // older
        source: "model-inferred",
        engagementMilli: 0,
        frustrationMilli: 0,
        confidenceMilli: 0,
      });
    }

    // Insert 50 newer rows with engagementMilli=1000 (these are the baseline window)
    for (let i = 0; i < 50; i++) {
      insertSample(db, {
        studentId: STUDENT_ID,
        ts: new Date(base + 100_000 + i * 1000), // much newer
        source: "model-inferred",
        engagementMilli: 1000,
        frustrationMilli: 0,
        confidenceMilli: 1000,
      });
    }

    const result = await service.affective(STUDENT_ID);

    // Baseline should only cover the 50 newest rows (all engagementMilli=1000)
    expect(result.baseline.engagement).toBeCloseTo(1.0, 5);
    expect(result.baseline.frustration).toBeCloseTo(0.0, 5);
  });

  it("AffectSample shape includes source field", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const service = makeService(db);

    insertSample(db, {
      studentId: STUDENT_ID,
      ts: new Date(),
      source: "explicit-checkin",
      engagementMilli: 500,
      frustrationMilli: 500,
      confidenceMilli: 700,
    });

    const result = await service.affective(STUDENT_ID);

    expect(result.recent[0]?.source).toBe("explicit-checkin");
  });
});
