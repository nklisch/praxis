/**
 * Exam modality tab body.
 *
 * Full-tab proctored layout. No chat thread visible — the only conversational
 * affordance is the ClarificationPill corner button, which supports a single
 * one-shot rephrasing request. The exam-mode session is restricted server-side
 * to the `clarification` tool only.
 *
 * The examLockdown logic that previously lived in ChatTabBody moves here:
 * the assignment is always locked (no chat) until submitted.
 *
 * Timer: when assignment.durationMinutes is set, renders a countdown in the
 * kicker bar. Warns (orange) in the last 5 minutes. Auto-submits at expiry.
 */
import type { Assignment, AssignmentId, SessionId, SessionTabSummary } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { type JSX, useEffect, useRef, useState } from "react";
import { useAssignment } from "../hooks/use-assignment.js";
import { AssignmentCard } from "./assignment-card.js";
import { ClarificationPill } from "./clarification-pill.js";
import styles from "./exam-tab-body.module.css";

export interface ExamTabBodyProps {
  tab: SessionTabSummary;
}

// ─── Timer helpers ─────────────────────────────────────────────────────────────

function formatMmSs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const WARN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function computeRemainingMs(assignment: Assignment): number | null {
  if (!assignment.durationMinutes) return null;
  const expiresAt = assignment.assignedAt + assignment.durationMinutes * 60 * 1000;
  return expiresAt - Date.now();
}

// ─── Countdown component ───────────────────────────────────────────────────────

interface CountdownProps {
  assignment: Assignment;
  onExpiry: () => void;
}

function ExamCountdown({ assignment, onExpiry }: CountdownProps): JSX.Element | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    computeRemainingMs(assignment),
  );
  // Track whether we've already fired the expiry callback to avoid double-fire.
  const expiredRef = useRef(false);
  // Hold a stable reference to the callback so the interval closure stays fresh.
  const onExpiryRef = useRef(onExpiry);
  onExpiryRef.current = onExpiry;

  useEffect(() => {
    if (!assignment.durationMinutes) return;

    const tick = () => {
      const remaining = computeRemainingMs(assignment);
      setRemainingMs(remaining);
      if (remaining !== null && remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpiryRef.current();
      }
    };

    // Fire immediately so the display is right on mount.
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [assignment]);

  if (remainingMs === null) return null;

  const isWarn = remainingMs < WARN_THRESHOLD_MS;
  const displayMs = Math.max(0, remainingMs);

  return (
    <span className={isWarn ? styles.timerWarn : styles.timer} aria-live="off">
      {formatMmSs(displayMs)} left
    </span>
  );
}

// ─── Main body ─────────────────────────────────────────────────────────────────

/**
 * Full-surface exam body. The assignment is the only content; the chat
 * thread is not rendered. A ClarificationPill is anchored to the bottom-right
 * for one-shot rephrasing requests only.
 */
export function ExamTabBody({ tab }: ExamTabBodyProps): JSX.Element {
  const sessionId = tab.sessionId as SessionId;
  const assignmentId = tab.assignmentId
    ? brandId<"AssignmentId">(tab.assignmentId as string)
    : undefined;

  // Load the assignment so we can read durationMinutes + assignedAt for the timer,
  // and access the submit function for auto-submit on expiry.
  const { assignment, submit, submitting } = useAssignment(
    assignmentId as AssignmentId | undefined,
  );

  const [autoSubmitNotice, setAutoSubmitNotice] = useState(false);

  const handleExpiry = async () => {
    if (assignment?.submittedAt) return; // already submitted — nothing to do
    setAutoSubmitNotice(true);
    await submit();
  };

  return (
    <div className={styles.container}>
      {/* Kicker bar */}
      <div className={styles.kicker}>
        <span className={styles.kickerMode}>exam</span>
        {tab.title && <span className={styles.kickerTitle}>{tab.title}</span>}
        <span className={styles.kickerNotice}>chat is muted during the exam</span>
        {/* Countdown — only rendered when assignment is loaded and has a duration */}
        {assignment && !assignment.submittedAt && (
          <ExamCountdown assignment={assignment} onExpiry={handleExpiry} />
        )}
      </div>

      {/* Auto-submit notice */}
      {autoSubmitNotice && (
        <div className={styles.autoSubmitNotice} role="status">
          {submitting ? "Time's up — auto-submitting…" : "Time's up — auto-submitted."}
        </div>
      )}

      {/* Main body: full-width assignment, relative for ClarificationPill positioning */}
      <div className={styles.body}>
        {assignmentId ? (
          <AssignmentCard assignmentId={assignmentId} examLockdown={false} />
        ) : (
          <div className={styles.noAssignment}>
            <p>no assignment is linked to this session.</p>
          </div>
        )}

        {/* ClarificationPill anchored within the body */}
        <ClarificationPill sessionId={sessionId} />
      </div>
    </div>
  );
}
