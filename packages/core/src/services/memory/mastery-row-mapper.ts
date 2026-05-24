import { studentMastery } from "@praxis/memory/schema";
import type { ConceptMastery } from "../../types/memory.js";
import { brandId } from "../../types/index.js";

/**
 * The inferred row type from the studentMastery Drizzle table.
 * Using $inferSelect avoids hand-rolling a duplicate interface.
 */
export type StudentMasteryRow = typeof studentMastery.$inferSelect;

/**
 * Converts a raw studentMastery DB row into a ConceptMastery domain object.
 *
 * Returns the stored ConceptMastery WITHOUT decay applied.
 * Decay is a read-time concern; callers apply it after if needed.
 *
 * - milli-int fields (pKnown, uncertainty, effectivePKnown) are divided by 1000 → float.
 * - conceptId and evidence EventIds are branded.
 * - lastPracticedAt is converted from Date to Timestamp (number) when present.
 */
export function rowToConceptMastery(row: StudentMasteryRow): ConceptMastery {
  const conceptId = brandId<"ConceptId">(row.conceptId);
  const pKnown = row.pKnown / 1000;
  const uncertainty = row.uncertainty / 1000;
  const effectivePKnown = row.effectivePKnown / 1000;
  const lastPracticedAt = row.lastPracticedAt
    ? (row.lastPracticedAt.getTime() as import("../../types/common.js").Timestamp)
    : undefined;
  const evidence = (row.evidenceJson as string[]).map((id) => brandId<"EventId">(id));

  return {
    conceptId,
    pKnown,
    uncertainty,
    effectivePKnown,
    ...(lastPracticedAt !== undefined && { lastPracticedAt }),
    evidence,
  };
}
