/**
 * ResumedBanner — shown briefly when a session tab is re-opened with prior
 * conversation history. Surfaces a quiet "Resumed" indicator at the top of
 * the message area so the student knows they are picking up an existing
 * session rather than starting fresh.
 *
 * Design: non-intrusive, fades in fast, holds for ~2.5s, fades out over 0.5s
 * (total visible time ~3s). Self-dismisses via CSS animation; no state
 * mutation needed after mount.
 */
import type { JSX } from "react";
import styles from "./resumed-banner.module.css";

export interface ResumedBannerProps {
  /** The session title shown in the banner ("Resumed — {title}"). */
  title: string;
}

export function ResumedBanner({ title }: ResumedBannerProps): JSX.Element {
  return (
    <div
      className={styles.banner}
      role="status"
      aria-live="polite"
      aria-label={`Resumed session: ${title}`}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>Resumed</span>
      {title && <span className={styles.title}>{title}</span>}
    </div>
  );
}
