import type { PraxisDb } from "@praxis/core/db";
import { and, eq } from "drizzle-orm";
import { termFirstOccurrences } from "./schema.js";

export interface TermFirstOccurrencesService {
  /**
   * Returns true if the student has previously encountered `term`
   * (normalized). False on the very first occurrence.
   */
  hasSeenTerm(studentId: string, term: string): Promise<boolean>;

  /**
   * Records that `term` was first seen by `studentId` in `sessionId`.
   * Idempotent: ON CONFLICT DO NOTHING preserves the original first-seen row.
   */
  markTermSeen(studentId: string, term: string, sessionId: string): Promise<void>;
}

/**
 * Normalize a term for comparison:
 * - lowercase
 * - strip punctuation (anything that's not word char or whitespace)
 * - collapse internal whitespace to single spaces
 * - trim surrounding whitespace
 */
function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createTermFirstOccurrencesService(deps: {
  db: PraxisDb;
}): TermFirstOccurrencesService {
  return {
    async hasSeenTerm(studentId, term) {
      const normalized = normalizeTerm(term);
      const row = deps.db
        .select({ studentId: termFirstOccurrences.studentId })
        .from(termFirstOccurrences)
        .where(
          and(
            eq(termFirstOccurrences.studentId, studentId),
            eq(termFirstOccurrences.termNormalized, normalized),
          ),
        )
        .get();
      return row !== undefined;
    },

    async markTermSeen(studentId, term, sessionId) {
      const normalized = normalizeTerm(term);
      deps.db
        .insert(termFirstOccurrences)
        .values({
          studentId,
          termNormalized: normalized,
          firstSeenSessionId: sessionId,
          firstSeenAt: new Date(),
        })
        .onConflictDoNothing()
        .run();
    },
  };
}
