import type { Assignment, AssignmentResponse, PromptFragment } from "@praxis/core/types";

export interface ComposeAssignmentContextInput {
  assignment: Assignment;
  responses: ReadonlyArray<AssignmentResponse>;
}

/**
 * Build a `context`-position PromptFragment summarizing the active assignment.
 * Includes the assignment kind, title, item count, current submission state,
 * and which items have responses recorded (without revealing the responses
 * themselves — that's not the agent's concern at brief time).
 *
 * The returned fragment has id "context.assignment-state" which matches the
 * fallback fragment in modes/fragments/assignment-context.ts so the override
 * mechanism replaces it cleanly.
 */
export function composeAssignmentContextFragment(
  input: ComposeAssignmentContextInput,
): PromptFragment {
  const { assignment, responses } = input;
  const recordedItemIds = new Set(responses.map((r) => r.itemId));
  const lines: string[] = [];

  lines.push(
    `Active assignment: "${assignment.title}" (${assignment.kind}, ${assignment.items.length} items)`,
  );

  if (assignment.submittedAt) {
    const grade = assignment.grade;
    lines.push(`Status: SUBMITTED. Total: ${grade ? grade.total.toFixed(2) : "—"}.`);
    if (grade) {
      lines.push(
        `Per-item: ${grade.perItem
          .map((p) => `${p.itemId}=${p.score === null ? "needs-review" : p.score.toFixed(2)}`)
          .join(", ")}`,
      );
      lines.push(`Use assignment.read_grade to fetch full per-item feedback for narration.`);
    }
  } else {
    const answered = assignment.items.filter((it) => recordedItemIds.has(it.id)).length;
    lines.push(`Status: IN PROGRESS. ${answered}/${assignment.items.length} items answered.`);
  }

  return {
    id: "context.assignment-state",
    position: "context",
    customizable: true,
    template: lines.join("\n"),
  };
}
