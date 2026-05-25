/**
 * Inline assignment card — rendered in the chat surface when a session has an
 * assignmentId bound to it (quiz / homework / exam sessions).
 *
 * Phase 15a: adds per-item SketchCanvas for math items. Sketch capture
 * happens on submit only (v1 — no auto-save bandwidth; revisit if needed).
 * The captured sketchId is uploaded via client.sketches.put and recorded
 * via client.assignments.recordResponse before the final submit call.
 *
 * Async refactor (step-3): submit uses `useOptimisticAction` — the button
 * never disables during the in-flight IPC chain; a `<ActionPip>` beside it
 * conveys state; failures surface inline via `<FailurePopover>`.
 */
import type { AssignmentId } from "@praxis/core/types";
import { useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useActionEscalation } from "../hooks/use-action-escalation.js";
import { useAssignment } from "../hooks/use-assignment.js";
import { useOptimisticAction } from "../hooks/use-optimistic-action.js";
import { COPY } from "../lib/copy.js";
import { ActionPip } from "./action-pip.js";
import styles from "./assignment-card.module.css";
import { AssignmentFeedback } from "./assignment-feedback.js";
import { AssignmentItemCard } from "./assignment-item-card.js";
import { FailurePopover } from "./failure-popover.js";
import type { SketchCanvasHandle } from "./sketch-canvas.js";

export interface AssignmentCardProps {
  assignmentId: AssignmentId;
  /**
   * True for exam mode — the parent (chat route) uses this prop to disable
   * the chat composer while the assignment is unsubmitted. The card itself
   * reads the actual submitted state for its own disabled logic.
   */
  examLockdown?: boolean;
}

export function AssignmentCard({ assignmentId, examLockdown: _examLockdown }: AssignmentCardProps) {
  const client = usePraxisClient();
  const {
    assignment,
    responses,
    work,
    confidences,
    loading,
    error,
    recordResponse,
    recordConfidence,
    submit,
  } = useAssignment(assignmentId);

  // Local grade state — set after successful submission
  const [localGrade, setLocalGrade] = useState<NonNullable<typeof assignment>["grade"] | null>(
    null,
  );

  /**
   * Phase 15a: per-item sketch handles. Keyed by item.id.
   * Only math items get a canvas; other kinds will have no entry.
   * We use a Map stored in a ref (not state) so registering a ref
   * doesn't trigger re-renders.
   */
  const sketchHandleRefs = useRef<Map<string, SketchCanvasHandle | null>>(new Map());

  // Track when the submit action failed so escalation can be time-keyed.
  const [failedAt, setFailedAt] = useState<number | null>(null);

  const submitAction = useOptimisticAction<void>({
    dispatch: async () => {
      // Phase 15a: capture + upload sketches for any math items that have been drawn.
      if (assignment) {
        for (const item of assignment.items) {
          if (item.kind !== "math") continue;
          const handle = sketchHandleRefs.current.get(item.id);
          if (!handle) continue;

          try {
            const captured = await handle.capture();
            // Skip empty canvases (no shapes drawn).
            if (captured.width === 0) continue;

            const summary = await client.sketches.put({
              snapshot: captured.snapshot,
              image: captured.image,
              width: captured.width,
              height: captured.height,
            });

            // Record the sketchId on the dedicated column. Grader fetches the
            // sketch via response.sketchId or grade_math({ kind: "sketch", sketchId }).
            const existingWork = work.get(item.id) ?? "";
            await client.assignments
              .recordResponse({
                assignmentId,
                itemId: item.id,
                response: responses.get(item.id) ?? "",
                ...(existingWork.trim() && { work: existingWork }),
                sketchId: summary.id as string,
              })
              .catch(() => {
                // Non-fatal — the typed response is still submitted even if sketch fails
              });
          } catch {
            // Capture failure is non-fatal: the typed answer still submits.
          }
        }
      }

      const result = await submit();
      if (result) {
        setLocalGrade(result.grade);
      } else {
        // useAssignment.submit swallows errors and returns null on failure.
        // Propagate as a throw so useOptimisticAction can transition to "failed".
        throw new Error("Submission failed — please retry.");
      }
    },
    onError: () => {
      setFailedAt(Date.now());
    },
  });

  const handleSubmit = () => {
    submitAction.trigger();
  };

  // Escalate unattended failures to the activity strip after threshold.
  useActionEscalation({
    failedActions:
      submitAction.state === "failed" && failedAt !== null
        ? [{ id: "assignment-submit", label: "Assignment submit failed", failedAt }]
        : [],
    activity: null,
  });

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
          const hasWorkRubric =
            (item.kind === "math" || item.kind === "code" || item.kind === "numerical") &&
            item.workRubric !== undefined;
          // Phase 15a: create a ref setter for math items.
          const sketchHandleRef =
            item.kind === "math"
              ? (handle: SketchCanvasHandle | null) => {
                  sketchHandleRefs.current.set(item.id, handle);
                }
              : undefined;
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
                disabled={isSubmitted}
                {...(sketchHandleRef !== undefined && { sketchHandleRef })}
                {...(assignment.kind === "quiz" && {
                  confidence: confidences.get(item.id) ?? null,
                  onConfidenceChange: (c) => recordConfidence(item.id, c),
                })}
              />
              {itemGrade && (
                <AssignmentFeedback
                  grade={itemGrade}
                  {...("rubric" in item && item.rubric !== undefined && { rubric: item.rubric })}
                  {...(("math" === item.kind ||
                    "code" === item.kind ||
                    "numerical" === item.kind) &&
                    item.workRubric !== undefined && { workRubric: item.workRubric })}
                />
              )}
            </li>
          );
        })}
      </ol>

      {!isSubmitted && (
        <div className={styles.submitSection}>
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
            }}
          >
            <button type="button" className={styles.submitBtn} onClick={handleSubmit}>
              Submit
            </button>
            <ActionPip state={submitAction.state} />
            {submitAction.state === "failed" && (
              <FailurePopover
                reason={submitAction.errorReason}
                actions={[
                  {
                    label: COPY.actionPip.retryLabel,
                    onClick: submitAction.retry,
                    variant: "primary",
                  },
                  { label: COPY.actionPip.dismissLabel, onClick: submitAction.dismiss },
                ]}
              />
            )}
          </div>
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
