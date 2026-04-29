/**
 * End-to-end integration test for Phase 7 misconception tracking.
 *
 * Verifies:
 * 1. `recordMisconception` writes to the misconceptions table and is readable via `misconceptions()`.
 * 2. A second call with the same (conceptId, errorForm) merges into the existing row (merged=true).
 * 3. A call with a different errorForm creates a separate row.
 * 4. The returned `misconceptionId` is stable across merged updates.
 *
 * Uses real DB (via useTempDb) for full integration coverage.
 */

import { openDb } from "@praxis/core/db";
import { MemoryServiceImpl } from "@praxis/core/services";
import { brandId } from "@praxis/core/types";
import { misconceptions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ── Tests ──────────────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

describe("misconception end-to-end", () => {
  it("recordMisconception writes to misconceptions table and is readable", async () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const memoryService = new MemoryServiceImpl({
      db: client,
      log: noopLogger,
      decayDaysFor: () => 14,
    });

    const studentId = brandId<"StudentId">("student-misc-e2e-1");
    const conceptId = brandId<"ConceptId">("concept-inequalities");

    const result = memoryService.recordMisconception({
      studentId,
      conceptId,
      description: "Flips inequality sign when multiplying by a positive number",
      errorForm: "flips-sign-positive-multiply",
      remediation: {
        strategyId: "explicit-counter-example",
        rationale: "Show a concrete positive multiplier case where direction is preserved",
      },
      evidenceEventIds: ["event-001"],
    });

    expect(result.misconceptionId).toBeDefined();
    expect(result.merged).toBe(false);

    // Raw DB check
    const rows = client
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, studentId))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.conceptId).toBe(conceptId);
    expect(rows[0]?.errorForm).toBe("flips-sign-positive-multiply");
    expect(rows[0]?.status).toBe("active");

    // Read via service
    const listed = await memoryService.misconceptions(studentId);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(result.misconceptionId);
    expect(listed[0]?.description).toBe("Flips inequality sign when multiplying by a positive number");
  });

  it("same (conceptId, errorForm) merges on second call", () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const memoryService = new MemoryServiceImpl({
      db: client,
      log: noopLogger,
      decayDaysFor: () => 14,
    });

    const studentId = brandId<"StudentId">("student-misc-e2e-2");
    const conceptId = brandId<"ConceptId">("concept-fractions");

    const first = memoryService.recordMisconception({
      studentId,
      conceptId,
      description: "Adds numerators and denominators separately",
      errorForm: "additive-fraction-arithmetic",
      remediation: {
        strategyId: "worked-examples",
        rationale: "Walk through common-denominator worked examples",
      },
      evidenceEventIds: ["event-a01"],
    });

    expect(first.merged).toBe(false);

    const second = memoryService.recordMisconception({
      studentId,
      conceptId,
      description: "Adds numerators and denominators separately",
      errorForm: "additive-fraction-arithmetic",
      remediation: {
        strategyId: "worked-examples",
        rationale: "Walk through common-denominator worked examples",
      },
      evidenceEventIds: ["event-a02"],
    });

    expect(second.merged).toBe(true);
    // Same misconception ID — merged into the original row.
    expect(second.misconceptionId).toBe(first.misconceptionId);

    // Only one row in the DB
    const rows = client
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, studentId))
      .all();
    expect(rows).toHaveLength(1);
  });

  it("different errorForm creates a separate row", () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const memoryService = new MemoryServiceImpl({
      db: client,
      log: noopLogger,
      decayDaysFor: () => 14,
    });

    const studentId = brandId<"StudentId">("student-misc-e2e-3");
    const conceptId = brandId<"ConceptId">("concept-exponents");

    const first = memoryService.recordMisconception({
      studentId,
      conceptId,
      description: "Adds exponents instead of multiplying",
      errorForm: "adds-exponents-on-multiply",
      remediation: { strategyId: "socratic", rationale: "Ask student to expand then count" },
      evidenceEventIds: ["event-b01"],
    });

    const second = memoryService.recordMisconception({
      studentId,
      conceptId,
      description: "Confuses exponent with coefficient",
      errorForm: "exponent-vs-coefficient-confusion",
      remediation: {
        strategyId: "explicit-counter-example",
        rationale: "Show x^2 vs 2x visually",
      },
      evidenceEventIds: ["event-b02"],
    });

    expect(first.merged).toBe(false);
    expect(second.merged).toBe(false);
    expect(second.misconceptionId).not.toBe(first.misconceptionId);

    const rows = client
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, studentId))
      .all();
    expect(rows).toHaveLength(2);
  });

  it("misconceptionId is stable after evidence merge", () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const memoryService = new MemoryServiceImpl({
      db: client,
      log: noopLogger,
      decayDaysFor: () => 14,
    });

    const studentId = brandId<"StudentId">("student-misc-e2e-4");
    const conceptId = brandId<"ConceptId">("concept-algebra");

    const r1 = memoryService.recordMisconception({
      studentId,
      conceptId,
      description: "Moves terms without flipping sign",
      errorForm: "no-sign-flip-on-move",
      remediation: { strategyId: "worked-examples", rationale: "Show sign-flip in worked examples" },
      evidenceEventIds: ["event-c01"],
    });

    // Apply 3 more observations — all should merge and keep the same ID.
    for (let i = 2; i <= 4; i++) {
      const rN = memoryService.recordMisconception({
        studentId,
        conceptId,
        description: "Moves terms without flipping sign",
        errorForm: "no-sign-flip-on-move",
        remediation: {
          strategyId: "worked-examples",
          rationale: "Show sign-flip in worked examples",
        },
        evidenceEventIds: [`event-c0${i}`],
      });
      expect(rN.merged).toBe(true);
      expect(rN.misconceptionId).toBe(r1.misconceptionId);
    }
  });
});
