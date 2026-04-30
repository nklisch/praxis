/**
 * Unit tests for MemoryServiceImpl.read() — Phase 9 MasteryReader port.
 *
 * Uses a real temp DB (migrations via useTempDb).
 * Covers: returns 0 for unknown concept, returns decay-aware score for known concept.
 */
import { studentMastery } from "@praxis/memory/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import { brandId } from "../../../types/index.js";
import { MemoryServiceImpl } from "../memory-service.js";

const STUDENT_ID = brandId<"StudentId">("student-mastery-reader");
const CONCEPT_A = brandId<"ConceptId">("concept-mastery-a");
const CONCEPT_B = brandId<"ConceptId">("concept-mastery-b");

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

describe("MemoryServiceImpl.read() — MasteryReader port", () => {
  it("returns 0 for an unknown concept (fail-safe)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    const score = await svc.read({ studentId: STUDENT_ID, conceptId: CONCEPT_A });
    expect(score).toBe(0);
  });

  it("returns decay-aware pKnown for a known concept", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);

    // Insert a mastery row directly (pKnown stored as integer ×1000).
    const rawPKnown = 750; // 0.75
    db.insert(studentMastery)
      .values({
        studentId: STUDENT_ID,
        conceptId: CONCEPT_A,
        pKnown: rawPKnown,
        effectivePKnown: rawPKnown,
        uncertainty: 200,
        evidenceJson: [],
        lastPracticedAt: new Date(), // just now → no decay
        updatedAt: new Date(),
      })
      .run();

    const score = await svc.read({ studentId: STUDENT_ID, conceptId: CONCEPT_A });
    // With lastPracticedAt = now and 14-day decay, effective should be ~0.75
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThanOrEqual(0.75);
  });

  it("returns 0 for a different student's concept", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    const OTHER = brandId<"StudentId">("other-student-reader");

    db.insert(studentMastery)
      .values({
        studentId: OTHER,
        conceptId: CONCEPT_B,
        pKnown: 800,
        effectivePKnown: 800,
        uncertainty: 100,
        evidenceJson: [],
        lastPracticedAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    // STUDENT_ID should not see OTHER's concept
    const score = await svc.read({ studentId: STUDENT_ID, conceptId: CONCEPT_B });
    expect(score).toBe(0);
  });

  it("applies decay: highly decayed score is below the stored pKnown", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    // Use very short decay for this test (1 day).
    const svc = new MemoryServiceImpl({ db, log: MOCK_LOG, decayDaysFor: () => 1 });
    const STUDENT_DECAY = brandId<"StudentId">("student-decay-test");
    const CONCEPT_DECAY = brandId<"ConceptId">("concept-decay-test");

    // Practiced 10 days ago — well past 1-day decay constant.
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    db.insert(studentMastery)
      .values({
        studentId: STUDENT_DECAY,
        conceptId: CONCEPT_DECAY,
        pKnown: 900, // 0.9 stored
        effectivePKnown: 900,
        uncertainty: 100,
        evidenceJson: [],
        lastPracticedAt: tenDaysAgo,
        updatedAt: tenDaysAgo,
      })
      .run();

    const score = await svc.read({ studentId: STUDENT_DECAY, conceptId: CONCEPT_DECAY });
    // With heavy decay (10× the half-life), score should be well below 0.9
    expect(score).toBeLessThan(0.7);
  });
});
