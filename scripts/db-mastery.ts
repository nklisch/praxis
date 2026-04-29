/**
 * db:mastery — CLI script to display per-(student, concept) mastery scores.
 *
 * Usage: pnpm db:mastery
 *
 * Reads `student_mastery` rows, applies exponential decay at read time
 * (default 14-day half-life), and prints a formatted table.
 */

import { openDb } from "@praxis/core/db";
import { applyDecay } from "@praxis/core/services";
import { concepts } from "@praxis/curriculum/schema";
import { studentMastery } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";

const { db } = openDb({ readonly: true });

const rows = db
  .select({
    studentId: studentMastery.studentId,
    conceptId: studentMastery.conceptId,
    pKnown: studentMastery.pKnown,
    uncertainty: studentMastery.uncertainty,
    effectivePKnown: studentMastery.effectivePKnown,
    lastPracticedAt: studentMastery.lastPracticedAt,
    updatedAt: studentMastery.updatedAt,
    conceptName: concepts.name,
  })
  .from(studentMastery)
  .leftJoin(concepts, eq(studentMastery.conceptId, concepts.id))
  .all();

if (rows.length === 0) {
  console.log(
    "No mastery rows found. Run a teach session with grade_math or update_mastery calls.",
  );
  process.exit(0);
}

const now = Date.now();
const DECAY_DAYS = 14;

const tableRows = rows.map((row) => {
  const pKnown = row.pKnown / 1000;
  const uncertainty = row.uncertainty / 1000;
  const lastPracticedAt = row.lastPracticedAt ? row.lastPracticedAt.getTime() : undefined;

  const effectivePKnown = applyDecay({
    pKnown,
    lastPracticedAt,
    now,
    decayDays: DECAY_DAYS,
  });

  const elapsedDays =
    lastPracticedAt !== undefined ? ((now - lastPracticedAt) / 86_400_000).toFixed(1) : "never";

  const masteryLabel =
    effectivePKnown >= 0.8
      ? "mastered"
      : effectivePKnown >= 0.4
        ? "in progress"
        : "not yet started";

  return {
    studentId: row.studentId.slice(0, 8) + "…",
    conceptId: row.conceptId.slice(0, 8) + "…",
    name: row.conceptName ?? "(unknown)",
    pKnown: pKnown.toFixed(3),
    uncertainty: uncertainty.toFixed(3),
    effectivePKnown: effectivePKnown.toFixed(3),
    status: masteryLabel,
    daysSincePractice: elapsedDays,
    updatedAt: row.updatedAt.toISOString().slice(0, 19),
  };
});

console.log(
  `\nMastery table (${tableRows.length} concepts, decay constant = ${DECAY_DAYS} days)\n`,
);
console.table(tableRows);
