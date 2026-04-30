import type { GradeItem, Rubric } from "@praxis/core/types";
import styles from "./assignment-feedback.module.css";

export interface AssignmentFeedbackProps {
  grade: GradeItem;
  /** The item's rubric (for rendering criterion names alongside per-criterion scores). */
  rubric?: Rubric;
  /** The item's workRubric (for rendering work-rubric criterion names). */
  workRubric?: Rubric;
}

type Tone = "good" | "partial" | "miss" | "review";

function scoreTone(grade: GradeItem): Tone {
  if (grade.gradedBy === "needs-human-review" || grade.score === null) return "review";
  if (grade.score >= 0.7) return "good";
  if (grade.score >= 0.4) return "partial";
  return "miss";
}

function scoreLabel(grade: GradeItem): string {
  if (grade.score === null) return "needs review";
  return `${Math.round(grade.score * 100)}%`;
}

/**
 * Post-submission per-item feedback display.
 *
 * Shows:
 * - Tone-coded score badge (green ≥70%, amber 40-69%, red <40%, gray for needs-review).
 * - Feedback text (from grader or rubric agent).
 * - Collapsible per-criterion breakdown when perCriterion is present.
 * - Rubric-agent tag when applicable.
 *
 * Phase 8 v2: reads criterion names from rubric.criteria / workRubric.criteria
 * so the UI shows descriptions rather than raw criterion ids.
 */
export function AssignmentFeedback({ grade, rubric, workRubric }: AssignmentFeedbackProps) {
  const tone = scoreTone(grade);

  // Build a map from criterionId → description for display
  const criterionNameById = new Map<string, string>();
  for (const c of rubric?.criteria ?? []) {
    criterionNameById.set(c.id, c.description);
  }
  for (const c of workRubric?.criteria ?? []) {
    criterionNameById.set(c.id, c.description);
  }

  const hasPerCriterion = grade.perCriterion !== undefined && grade.perCriterion.length > 0;

  return (
    <div className={`${styles.feedback} ${styles[tone]}`}>
      <span className={styles.scoreBadge}>{scoreLabel(grade)}</span>
      <p className={styles.feedbackText}>{grade.feedback}</p>

      {hasPerCriterion && (
        <details className={styles.perCriterion}>
          <summary>Per-criterion breakdown</summary>
          <ul className={styles.criterionList}>
            {grade.perCriterion!.map((c) => (
              <li key={`${c.source}:${c.criterionId}`} className={styles.criterionRow}>
                <span className={styles.criterionName}>
                  {criterionNameById.get(c.criterionId) ?? c.criterionId}
                </span>
                <span className={styles.criterionScore}>{c.score}/10</span>
                <span className={styles.criterionSource}>
                  {c.source === "work-rubric" ? "(work)" : ""}
                </span>
                <p className={styles.criterionRationale}>{c.rationale}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {grade.gradedBy === "rubric-agent" && <small className={styles.tier}>(rubric agent)</small>}
    </div>
  );
}
