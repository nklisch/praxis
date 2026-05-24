/**
 * submission-helpers.ts — Pure helper functions for assignment submission.
 *
 * Extracted from assignment-service.ts (was lines 256–308).
 * Both functions are stateless and have no dependency on CRUD logic or grader
 * orchestration — they belong here, not in the grading loop.
 *
 * Imports:
 *   - assignments table (for AssignmentRow type derivation)
 *   - core domain types (Assignment, Grade, ConceptId, Timestamp, brandId)
 */

import { assignments } from "@praxis/artifacts/schema";
import type { Assignment, AssignmentItem, Grade } from "../../types/artifacts.js";
import { brandId } from "../../types/index.js";
import type { Timestamp } from "../../types/common.js";

// ─── DB row → domain type ─────────────────────────────────────────────────────

type AssignmentRow = typeof assignments.$inferSelect;

export function rowToAssignment(row: AssignmentRow): Assignment {
  return {
    id: brandId<"AssignmentId">(row.id),
    courseId: brandId<"CourseId">(row.courseId),
    kind: row.kind,
    title: row.title,
    items: row.itemsJson as AssignmentItem[],
    conceptIds: (row.conceptIdsJson as string[]).map((id) => brandId<"ConceptId">(id)),
    assignedAt: row.assignedAt.getTime() as Timestamp,
    ...(row.submittedAt !== null &&
      row.submittedAt !== undefined && {
        submittedAt: row.submittedAt.getTime() as Timestamp,
      }),
    ...(row.gradeJson !== null &&
      row.gradeJson !== undefined && {
        grade: row.gradeJson as Grade,
      }),
    ...(row.durationMinutes !== null &&
      row.durationMinutes !== undefined && {
        durationMinutes: row.durationMinutes,
      }),
  };
}

// ─── Submission note composition ──────────────────────────────────────────────

/**
 * Composes the human-readable note the tutor sees as a system_note event.
 * Structured for model parseability: one sentence header, aggregate line, item breakdown.
 */
export function composeSubmissionNote(input: {
  assignment: Assignment;
  grade: Grade;
  submittedAt: Date;
}): string {
  const total = Math.round(input.grade.total * 100);
  const lines: string[] = [];
  lines.push(`The student just submitted ${input.assignment.kind}: ${input.assignment.title}.`);
  lines.push(`Aggregate score: ${total}% (graded by: ${input.grade.reviewedBy}).`);
  lines.push("");
  lines.push("Per-item breakdown:");
  for (const item of input.grade.perItem) {
    const score = item.score === null ? "needs review" : `${Math.round(item.score * 100)}%`;
    lines.push(`- item ${item.itemId} (${item.gradedBy}): ${score} — ${item.feedback}`);
  }
  lines.push("");
  lines.push(
    "Narrate per-item feedback warmly. On misses, name the misconception and offer to work it through. Then return to the lesson.",
  );
  return lines.join("\n");
}
