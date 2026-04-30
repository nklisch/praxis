/**
 * db:grades — CLI script to display submitted assignment grades.
 *
 * Usage: pnpm db:grades
 *
 * Reads all `assignments` rows where `submittedAt` is not null, joins with
 * `courses` for human-readable titles, and prints a formatted table showing
 * per-assignment scores.
 */

import { assignments, courses } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { eq, isNotNull } from "drizzle-orm";

const { db } = openDb({ readonly: true });

const rows = db
  .select({
    id: assignments.id,
    courseId: assignments.courseId,
    kind: assignments.kind,
    title: assignments.title,
    gradeJson: assignments.gradeJson,
    submittedAt: assignments.submittedAt,
    courseTitle: courses.title,
  })
  .from(assignments)
  .leftJoin(courses, eq(assignments.courseId, courses.id))
  .where(isNotNull(assignments.submittedAt))
  .all();

if (rows.length === 0) {
  console.log(
    "\nNo submitted assignments found. Complete a quiz, homework, or exam to see results.\n",
  );
  process.exit(0);
}

interface StoredGrade {
  total: number;
  perItem: Array<{ itemId: string; score: number | null; gradedBy?: string }>;
  reviewedBy: string;
}

const tableRows = rows.map((r) => {
  const grade = r.gradeJson as StoredGrade | null;

  const itemCount = grade?.perItem.length ?? 0;
  const scoredItems = grade?.perItem.filter((p) => p.score !== null) ?? [];
  const passedItems = scoredItems.filter((p) => (p.score ?? 0) >= 0.7);

  return {
    course: r.courseTitle ?? `${r.courseId.slice(0, 8)}…`,
    title: r.title,
    kind: r.kind,
    total: grade ? `${Math.round(grade.total * 100)}%` : "—",
    passed: grade ? `${passedItems.length}/${itemCount} ≥70%` : "—",
    reviewedBy: grade?.reviewedBy ?? "—",
    submittedAt: r.submittedAt?.toISOString().slice(0, 19) ?? "—",
  };
});

console.log(
  `\nGrades table (${tableRows.length} submitted assignment${tableRows.length !== 1 ? "s" : ""})\n`,
);
console.table(tableRows);
