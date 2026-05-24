/**
 * mastery-queries.ts — read-only DB accessors for mastery and misconception data.
 *
 * Extracts the five read methods from MemoryServiceImpl into a cohesive class.
 * All methods are pure reads; no writes, no logging.
 *
 * Consumers: MemoryServiceImpl (composition root), and potentially gate-readers
 * that need the MasteryReader.read() scalar directly.
 */

import { misconceptions, studentMastery } from "@praxis/memory/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type { Timestamp } from "../../types/common.js";
import type { ConceptId, MisconceptionId, StrategyId, StudentId } from "../../types/ids.js";
import { brandId } from "../../types/index.js";
import type { ConceptMastery, Misconception, StudentModel } from "../../types/memory.js";
import { applyDecay } from "./decay.js";
import { rowToConceptMastery } from "./mastery-row-mapper.js";

export interface MasteryQueriesDeps {
  db: PraxisDb;
  /** Resolves the decay constant for a concept at read time. */
  decayDaysFor: (conceptId: ConceptId) => number;
}

/** File-private helper: convert a misconceptions row to the Misconception domain type. */
function rowToMisconception(
  r: typeof misconceptions.$inferSelect,
  studentId: StudentId,
): Misconception {
  return {
    id: brandId<"MisconceptionId">(r.id),
    studentId,
    conceptId: brandId<"ConceptId">(r.conceptId),
    description: r.description,
    errorForm: r.errorForm,
    remediation: r.remediationJson as { strategyId: StrategyId; rationale: string },
    evidence: (r.evidenceJson as string[]).map((id) => brandId<"EventId">(id)),
    status: r.status as "active" | "remediated" | "manually-cleared",
    firstObservedAt: r.firstObservedAt.getTime() as Timestamp,
    lastObservedAt: r.lastObservedAt.getTime() as Timestamp,
  };
}

export class MasteryQueries {
  constructor(private readonly deps: MasteryQueriesDeps) {}

  /** Bulk read: all mastery rows for a student, with decay applied. */
  async studentModel(studentId: StudentId): Promise<StudentModel> {
    const rows = this.deps.db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, studentId))
      .all();

    const now = Date.now();
    const conceptMastery = new Map<ConceptId, ConceptMastery>();
    let latestUpdated: number | null = null;

    for (const row of rows) {
      const base = rowToConceptMastery(row);
      const decayDays = this.deps.decayDaysFor(base.conceptId);
      const effectivePKnown = applyDecay({
        pKnown: base.pKnown,
        lastPracticedAt: base.lastPracticedAt as number | undefined,
        now,
        decayDays,
      });

      conceptMastery.set(base.conceptId, { ...base, effectivePKnown });

      const updatedMs = row.updatedAt.getTime();
      if (latestUpdated === null || updatedMs > latestUpdated) {
        latestUpdated = updatedMs;
      }
    }

    return {
      studentId,
      conceptMastery,
      lastUpdated: (latestUpdated ?? now) as Timestamp,
    };
  }

  /** All misconceptions for a student, ordered active-first. */
  async misconceptions(studentId: StudentId): Promise<Misconception[]> {
    const rows = this.deps.db
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.studentId, studentId))
      // active first, then by lastObservedAt desc
      .orderBy(asc(misconceptions.status), desc(misconceptions.lastObservedAt))
      .all();

    return rows.map((r) => rowToMisconception(r, studentId));
  }

  /** Single mastery row. Returns null if not found. Snapshot helper. */
  async getMastery(input: {
    studentId: StudentId;
    conceptId: ConceptId;
  }): Promise<ConceptMastery | null> {
    const row = this.deps.db
      .select()
      .from(studentMastery)
      .where(
        and(
          eq(studentMastery.studentId, input.studentId),
          eq(studentMastery.conceptId, input.conceptId),
        ),
      )
      .get();
    if (!row) return null;
    return rowToConceptMastery(row);
  }

  /** Single misconception row. Returns null if not found. Snapshot helper. */
  async getMisconception(misconceptionId: MisconceptionId): Promise<Misconception | null> {
    const r = this.deps.db
      .select()
      .from(misconceptions)
      .where(eq(misconceptions.id, misconceptionId))
      .get();
    if (!r) return null;
    return rowToMisconception(r, brandId<"StudentId">(r.studentId));
  }

  /**
   * MasteryReader port: decay-aware scalar, 0 for unknown concepts.
   * Never throws — fail-safe for gate evaluation.
   */
  async read(input: { studentId: StudentId; conceptId: ConceptId }): Promise<number> {
    const row = this.deps.db
      .select()
      .from(studentMastery)
      .where(
        and(
          eq(studentMastery.studentId, input.studentId),
          eq(studentMastery.conceptId, input.conceptId),
        ),
      )
      .get();
    if (!row) return 0;
    const pKnown = row.pKnown / 1000;
    const lastPracticedAt = row.lastPracticedAt?.getTime();
    const decayDays = this.deps.decayDaysFor(input.conceptId);
    return applyDecay({ pKnown, lastPracticedAt, now: Date.now(), decayDays });
  }
}
