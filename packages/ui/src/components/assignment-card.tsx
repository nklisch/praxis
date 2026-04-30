import type { AssignmentId } from "@praxis/core/types";
import { useState } from "react";
import { useAssignment } from "../hooks/use-assignment.js";
import styles from "./assignment-card.module.css";
import { AssignmentFeedback } from "./assignment-feedback.js";
import { AssignmentItemCard } from "./assignment-item-card.js";

export interface AssignmentCardProps {
  assignmentId: AssignmentId;
  /**
   * True for exam mode — the parent (chat route) uses this prop to disable
   * the chat composer while the assignment is unsubmitted. The card itself
   * reads the actual submitted state for its own disabled logic.
   */
  examLockdown?: boolean;
}

/**
 * Inline assignment card rendered in the chat surface when a session has
 * an assignmentId bound to it (quiz / homework / exam sessions).
 *
 * Responsibilities:
 * - Load assignment + existing responses via useAssignment hook.
 * - Render per-item inputs via AssignmentItemCard.
 * - Auto-save on response change (debounced 1s — handled by hook).
 * - Submit → show "Grading…" → render per-item AssignmentFeedback.
 *
 * Future-proofing: does NOT bake in "tutor authored this" assumptions;
 * Phase 11 configure-mode assignments flow through the same component.
 */
export function AssignmentCard({ assignmentId, examLockdown: _examLockdown }: AssignmentCardProps) {
  const {
    assignment,
    responses,
    work,
    loading,
    error,
    submitting,
    submitError,
    recordResponse,
    submit,
  } = useAssignment(assignmentId);

  // Local grade state — set after successful submission
  const [localGrade, setLocalGrade] = useState<NonNullable<typeof assignment>["grade"] | null>(
    null,
  );

  const handleSubmit = async () => {
    const result = await submit();
    if (result) {
      setLocalGrade(result.grade);
    }
  };

  // Determine the authoritative grade: prefer the one returned at submit time;
  // fall back to assignment.grade (if the assignment was already submitted
  // before this component mounted, e.g. after a page reload).
  const grade = localGrade ?? assignment?.grade ?? null;
  const isSubmitted = !!grade;

  if (loading) {
    return (
      <div className={styles.card}>
        <p className={styles.loading}>Loading assignment…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.card}>
        <p className={styles.error}>Error: {error}</p>
      </div>
    );
  }

  if (!assignment) {
    return null;
  }

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <span className={styles.kindBadge}>{assignment.kind.toUpperCase()}</span>
        <h3 className={styles.title}>{assignment.title}</h3>
        <span className={styles.itemCount}>
          {assignment.items.length} item{assignment.items.length !== 1 ? "s" : ""}
        </span>
      </header>

      <ol className={styles.items}>
        {assignment.items.map((item, i) => {
          const itemGrade = grade?.perItem.find((p) => p.itemId === item.id);
          const hasWorkRubric = item.workRubric !== undefined;
          return (
            <li key={item.id}>
              <AssignmentItemCard
                item={item}
                index={i}
                response={responses.get(item.id) ?? ""}
                {...(hasWorkRubric && { work: work.get(item.id) ?? "" })}
                onResponseChange={(r) =>
                  recordResponse(item.id, r, hasWorkRubric ? (work.get(item.id) ?? "") : undefined)
                }
                {...(hasWorkRubric && {
                  onWorkChange: (w: string) =>
                    recordResponse(item.id, responses.get(item.id) ?? "", w),
                })}
                disabled={isSubmitted || submitting}
              />
              {itemGrade && (
                <AssignmentFeedback
                  grade={itemGrade}
                  {...(item.rubric !== undefined && { rubric: item.rubric })}
                  {...(item.workRubric !== undefined && { workRubric: item.workRubric })}
                />
              )}
            </li>
          );
        })}
      </ol>

      {!isSubmitted && (
        <div className={styles.submitSection}>
          <button
            type="button"
            className={styles.submitBtn}
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Grading…" : "Submit"}
          </button>
          {submitError && <p className={styles.submitError}>Error: {submitError}</p>}
        </div>
      )}

      {isSubmitted && (
        <p className={styles.submittedBanner}>
          Submitted — score:{" "}
          {grade?.total !== undefined ? `${Math.round(grade.total * 100)}%` : "—"}
        </p>
      )}
    </article>
  );
}
