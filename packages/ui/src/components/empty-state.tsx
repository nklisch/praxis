import type { JSX } from "react";
import styles from "./empty-state.module.css";

export interface EmptyStateProps {
  /** Editorial copy line. Use COPY.empty.* values. */
  message: string;
  /** Optional ornament glyph. Default: "·". Ignored in compact mode. */
  ornament?: string;
  /** Optional CTA button. */
  action?: { label: string; onClick: () => void };
  /**
   * Compact mode — renders an inline paragraph instead of a full-screen
   * centered layout. Use inside constrained containers (library sections, etc.).
   */
  compact?: boolean;
}

/** Editorial empty state — an invitation, never a notice. */
export function EmptyState({
  message,
  ornament = "·",
  action,
  compact = false,
}: EmptyStateProps): JSX.Element {
  if (compact) {
    return (
      <div className={styles.emptyCompact}>
        <p className={styles.lineCompact}>{message}</p>
        {action && (
          <button type="button" className={styles.actionBtnCompact} onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.empty}>
      <span className={styles.ornament} aria-hidden="true">
        {ornament}
      </span>
      <p className={styles.line}>{message}</p>
      {action && (
        <button type="button" className={styles.actionBtn} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
