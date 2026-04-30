/**
 * db:cards-due — list flashcards with nextReviewAt <= now.
 *
 * Usage: pnpm db:cards-due
 *
 * Reads the active Praxis database and prints a table of due cards
 * ordered by most-overdue first (oldest nextReviewAt first).
 */

import { flashcards } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { asc, lte } from "drizzle-orm";

const { db } = openDb({ readonly: true });

const now = new Date();

const dueCards = db
  .select({
    id: flashcards.id,
    front: flashcards.front,
    back: flashcards.back,
    conceptId: flashcards.conceptId,
    nextReviewAt: flashcards.nextReviewAt,
    studentId: flashcards.studentId,
  })
  .from(flashcards)
  .where(lte(flashcards.nextReviewAt, now))
  .orderBy(asc(flashcards.nextReviewAt))
  .all();

if (dueCards.length === 0) {
  console.log("No cards due.");
  process.exit(0);
}

const rows = dueCards.map((c) => ({
  id: `${c.id.slice(0, 8)}…`,
  front: c.front.length > 40 ? `${c.front.slice(0, 40)}…` : c.front,
  conceptId: c.conceptId ?? "(none)",
  nextReviewAt: c.nextReviewAt ? c.nextReviewAt.toISOString() : "(not set)",
  overdueMs: c.nextReviewAt ? now.getTime() - c.nextReviewAt.getTime() : 0,
}));

console.log(`\n${dueCards.length} card(s) due:\n`);
console.table(rows);
