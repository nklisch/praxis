/**
 * MemoryServiceImpl — Phase 11 configurator write method tests.
 *
 * Tests resetConcept, clearMisconception, and exportToFile.
 * Uses useTempDb() for a real migrated SQLite database.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { misconceptions, studentMastery } from "@praxis/memory/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import { brandId } from "../../../types/index.js";
import { bktInitial } from "../bkt.js";
import { MemoryServiceImpl } from "../memory-service.js";

const STUDENT_ID = brandId<"StudentId">("student-cfg");
const CONCEPT_A = brandId<"ConceptId">("concept-a");
const MISCONCEPTION_ID = brandId<"MisconceptionId">("misconception-1");

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

// ─── resetConcept ─────────────────────────────────────────────────────────────

describe("MemoryServiceImpl.resetConcept()", () => {
  it("upserts a mastery row to BKT initial state when no row exists", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    await svc.resetConcept({ studentId: STUDENT_ID, conceptId: CONCEPT_A, reason: "fresh start" });

    const rows = db.select().from(studentMastery).all();
    const row = rows.find((r) => r.studentId === STUDENT_ID && r.conceptId === CONCEPT_A);
    expect(row).toBeDefined();
    const initial = bktInitial();
    expect(row?.pKnown).toBe(Math.round(initial.pKnown * 1000));
    expect(row?.uncertainty).toBe(Math.round(initial.uncertainty * 1000));
    expect(row?.evidenceJson).toEqual([]);
    expect(row?.lastPracticedAt).toBeNull();
  });

  it("resets an existing mastery row to initial BKT state", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    // Seed a high-mastery row.
    db.insert(studentMastery)
      .values({
        studentId: STUDENT_ID,
        conceptId: CONCEPT_A,
        pKnown: 900, // 0.9
        uncertainty: 50,
        effectivePKnown: 900,
        lastPracticedAt: new Date(),
        evidenceJson: ["event-1", "event-2"],
        updatedAt: new Date(),
      })
      .run();

    const svc = makeService(db);
    await svc.resetConcept({
      studentId: STUDENT_ID,
      conceptId: CONCEPT_A,
      reason: "configurator reset",
    });

    const rows = db.select().from(studentMastery).all();
    const row = rows.find((r) => r.studentId === STUDENT_ID && r.conceptId === CONCEPT_A);
    expect(row).toBeDefined();
    const initial = bktInitial();
    // pKnown should be reset to initial.
    expect(row?.pKnown).toBe(Math.round(initial.pKnown * 1000));
    // Evidence cleared.
    expect(row?.evidenceJson).toEqual([]);
    // lastPracticedAt cleared.
    expect(row?.lastPracticedAt).toBeNull();
  });

  it("logs the reset with the reason", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const mockLog = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(), // biome-ignore lint/suspicious/noExplicitAny: test mock
      child: vi.fn().mockReturnValue(undefined as any),
    };
    const svc = new MemoryServiceImpl({ db, log: mockLog, decayDaysFor: () => 14 });

    await svc.resetConcept({ studentId: STUDENT_ID, conceptId: CONCEPT_A, reason: "test" });

    expect(mockLog.info).toHaveBeenCalledWith("memory.concept_reset", {
      conceptId: CONCEPT_A,
      reason: "test",
    });
  });
});

// ─── clearMisconception ───────────────────────────────────────────────────────

describe("MemoryServiceImpl.clearMisconception()", () => {
  function seedMisconception(db: ReturnType<typeof openDb>["db"]) {
    const now = new Date();
    db.insert(misconceptions)
      .values({
        id: MISCONCEPTION_ID,
        studentId: STUDENT_ID,
        conceptId: CONCEPT_A,
        description: "Confused about signs",
        errorForm: "sign-flip",
        remediationJson: { strategyId: "s1", rationale: "review signs" },
        evidenceJson: [],
        status: "active",
        firstObservedAt: now,
        lastObservedAt: now,
      })
      .run();
  }

  it("sets status to manually-cleared", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedMisconception(db);
    const svc = makeService(db);

    await svc.clearMisconception({ misconceptionId: MISCONCEPTION_ID, reason: "false positive" });

    const row = db
      .select()
      .from(misconceptions)
      .all()
      .find((r) => r.id === MISCONCEPTION_ID);
    expect(row).toBeDefined();
    expect(row?.status).toBe("manually-cleared");
  });

  it("updates lastObservedAt to now", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedMisconception(db);
    const svc = makeService(db);

    const before = Date.now();
    await svc.clearMisconception({ misconceptionId: MISCONCEPTION_ID, reason: "test" });
    const after = Date.now();

    const row = db
      .select()
      .from(misconceptions)
      .all()
      .find((r) => r.id === MISCONCEPTION_ID);
    const updatedTs = row?.lastObservedAt.getTime();
    expect(updatedTs).toBeGreaterThanOrEqual(before);
    expect(updatedTs).toBeLessThanOrEqual(after);
  });

  it("logs the clear with the reason", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedMisconception(db);
    const mockLog = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(), // biome-ignore lint/suspicious/noExplicitAny: test mock
      child: vi.fn().mockReturnValue(undefined as any),
    };
    const svc = new MemoryServiceImpl({ db, log: mockLog, decayDaysFor: () => 14 });

    await svc.clearMisconception({ misconceptionId: MISCONCEPTION_ID, reason: "logged" });

    expect(mockLog.info).toHaveBeenCalledWith("memory.misconception_cleared", {
      misconceptionId: MISCONCEPTION_ID,
      reason: "logged",
    });
  });
});

// ─── exportToFile ─────────────────────────────────────────────────────────────

describe("MemoryServiceImpl.exportToFile()", () => {
  it("writes a JSON file and returns bytesWritten > 0", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const tmpDir = mkdtempSync(join(tmpdir(), "praxis-export-test-"));
    const targetPath = join(tmpDir, "memory-export.json");

    try {
      const result = await svc.exportToFile({ studentId: STUDENT_ID, targetPath });
      expect(result.ok).toBe(true);
      expect(result.bytesWritten).toBeGreaterThan(0);

      // Verify the file exists and parses as JSON.
      const content = await readFile(targetPath, "utf-8");
      const parsed = JSON.parse(content) as { studentId: string; formatVersion: string };
      expect(parsed.studentId).toBe(STUDENT_ID);
      expect(parsed.formatVersion).toBe("1.0");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("serialized file size matches bytesWritten", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const tmpDir = mkdtempSync(join(tmpdir(), "praxis-export-size-"));
    const targetPath = join(tmpDir, "export.json");

    try {
      const result = await svc.exportToFile({ studentId: STUDENT_ID, targetPath });
      const content = await readFile(targetPath, "utf-8");
      expect(result.bytesWritten).toBe(Buffer.byteLength(content, "utf-8"));
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
