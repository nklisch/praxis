/**
 * `<SystemNoteCard>` — inline card rendered when a `system_note` event
 * arrives in the parent (teach-mode) session stream.
 *
 * Phase 16: the card surfaces the assignment-submission result so the tutor
 * can narrate per-item feedback. It uses a green left-border, consistent with
 * the `.mockups/flows/assignment-spawn/05-parent-receives.html` reference.
 *
 * Only `assignment_submission` origins produce a visible card.
 * `system` origin notes are framework-internal and rendered invisibly.
 */

import type { SystemNoteOrigin } from "@praxis/core/types";
import type { JSX } from "react";
import { getModeMeta } from "./mode-meta.js";
import styles from "./system-note-card.module.css";

export interface SystemNoteCardProps {
  origin: SystemNoteOrigin;
  /** Child session id — used to open the child session on "review" click. May be undefined for non-assignment origins. */
  childSessionId: string | undefined;
  /** Called when the user clicks the "review the assignment →" link. */
  onReview: (() => void) | undefined;
}

export function SystemNoteCard({ origin, onReview }: SystemNoteCardProps): JSX.Element | null {
  if (origin.kind !== "assignment_submission") {
    // system-origin notes are framework-internal; render nothing visible.
    return null;
  }

  const { gradeTotal, submittedAt } = origin;

  // Format elapsed time since submission.
  const elapsedMs = Date.now() - submittedAt;
  const elapsedLabel = formatElapsed(elapsedMs);

  // Score label: gradeTotal is a 0–1 fraction.
  const pct = Math.round(gradeTotal * 100);
  const scoreLabel = `${pct}%`;

  return (
    <div className={styles.card} role="note" aria-label="Assignment result">
      <span className={styles.glyph} aria-hidden="true">
        ✓
      </span>
      <div className={styles.body}>
        <div className={styles.kicker}>
          <span className={styles.kickerOrnament} aria-hidden="true">
            {getModeMeta("quiz").ornament}
          </span>
          <span className={styles.kickerText}>assignment submitted</span>
        </div>
        <div className={styles.summary}>
          <strong>{scoreLabel}</strong> · {elapsedLabel} · child session closed
          {onReview && (
            <button type="button" className={styles.reviewLink} onClick={onReview}>
              ↗ review answers
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Format elapsed milliseconds as a human-readable string (e.g. "4m 12s"). */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
