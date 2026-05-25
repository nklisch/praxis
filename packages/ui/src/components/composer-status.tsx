/**
 * <ComposerStatus> — pure presentational status row beneath the composer.
 *
 * Priority ladder (highest first):
 *   1. failed   — failedCount > 0 (even during streaming)
 *   2. streaming — isStreaming and no failures
 *   3. queued   — pendingCount > 0 and not streaming and no failures
 *   4. idle     — all zero → returns null
 *
 * No internal state or effects — purely a function of props.
 */
import type { JSX } from "react";
import { COPY } from "../lib/copy.js";
import styles from "./composer-status.module.css";

export interface ComposerStatusProps {
  /** Whether the engine is currently streaming a response. */
  isStreaming: boolean;
  /** Number of turns queued but not yet dispatched. */
  pendingCount: number;
  /** Number of turns that ended in a failure state. */
  failedCount: number;
}

export function ComposerStatus({
  isStreaming,
  pendingCount,
  failedCount,
}: ComposerStatusProps): JSX.Element | null {
  if (failedCount > 0) {
    return (
      <div className={`${styles.composerStatus} ${styles.composerStatusFailed}`}>
        {COPY.composer.status.failed(failedCount)}
      </div>
    );
  }

  if (isStreaming) {
    return (
      <div className={`${styles.composerStatus} ${styles.composerStatusStreaming}`}>
        <span className={styles.composerStatusPip} aria-hidden="true" />
        {COPY.composer.status.streaming}
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className={styles.composerStatus}>
        {COPY.composer.status.queued(pendingCount)}
      </div>
    );
  }

  return null;
}
