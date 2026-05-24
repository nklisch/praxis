/**
 * mastery-writes.ts — canonical BKT write path for student mastery rows.
 *
 * Single source of truth for `applySignalsToConcept`. Both the active-path
 * `update_mastery` tool (via `MemoryServiceImpl.applySignal`) and the
 * passive-path `MasteryIndexer` delegate here.
 *
 * Pure in the sense that no logic is duplicated; the only side effects are
 * DB reads and upserts passed in through `deps`.
 */

import { studentMastery } from "@praxis/memory/schema";
import { and, eq } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type { ConceptId, MasterySignal, StudentId } from "../../types/index.js";
import { type BktState, DEFAULT_BKT, bktInitial, bktUpdate } from "./bkt.js";

/** Maximum evidence event IDs stored per mastery row (FIFO truncation). */
const MAX_EVIDENCE = 50;

/**
 * Apply a list of mastery signals to the given concept's `student_mastery` row.
 *
 * Reads the current row (or initialises from BKT priors), folds each signal
 * through `bktUpdate` in order, and upserts the result. Idempotent when called
 * with the same signals in the same order.
 *
 * Used by:
 *   - `MemoryServiceImpl.applySignal()` — active-path `update_mastery` tool
 *   - `MasteryIndexer.applySignalsToConcept()` — passive-path post-turn indexer
 */
export function applySignalsToConcept(
  deps: Pick<{ db: PraxisDb }, "db">,
  studentId: StudentId,
  conceptId: ConceptId,
  signals: MasterySignal[],
): void {
  if (signals.length === 0) return;

  const existing = deps.db
    .select()
    .from(studentMastery)
    .where(and(eq(studentMastery.studentId, studentId), eq(studentMastery.conceptId, conceptId)))
    .get();

  let state: BktState;
  let currentEvidence: string[];

  if (existing) {
    state = {
      pKnown: existing.pKnown / 1000,
      uncertainty: existing.uncertainty / 1000,
    };
    currentEvidence = existing.evidenceJson as string[];
  } else {
    state = bktInitial(DEFAULT_BKT);
    currentEvidence = [];
  }

  // Fold signals in order.
  for (const signal of signals) {
    state = bktUpdate(state, signal.kind);
    for (const evId of signal.evidenceEventIds) {
      currentEvidence.push(evId);
    }
  }

  // Cap evidence at MAX_EVIDENCE (FIFO — keep most recent).
  if (currentEvidence.length > MAX_EVIDENCE) {
    currentEvidence = currentEvidence.slice(currentEvidence.length - MAX_EVIDENCE);
  }

  const now = new Date();

  deps.db
    .insert(studentMastery)
    .values({
      studentId,
      conceptId,
      pKnown: Math.round(state.pKnown * 1000),
      uncertainty: Math.round(state.uncertainty * 1000),
      // effectivePKnown stored as the current pKnown at write time (decay applied at read).
      effectivePKnown: Math.round(state.pKnown * 1000),
      lastPracticedAt: now,
      evidenceJson: currentEvidence,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [studentMastery.studentId, studentMastery.conceptId],
      set: {
        pKnown: Math.round(state.pKnown * 1000),
        uncertainty: Math.round(state.uncertainty * 1000),
        effectivePKnown: Math.round(state.pKnown * 1000),
        lastPracticedAt: now,
        evidenceJson: currentEvidence,
        updatedAt: now,
      },
    })
    .run();
}
