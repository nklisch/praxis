import type { CSSProperties, JSX } from "react";
import { getModeMeta } from "./mode-meta.js";
import styles from "./session-head.module.css";

export interface SessionHeadProps {
  /** Mode identifier — used to look up glyph, label, and tint. */
  modeId: string;
  /** Display title of the session (e.g. "algebra · L3"). */
  title: string;
  /**
   * Optional progress value in [0, 1]. When present, renders a thin progress
   * bar alongside the percentage. When absent the progress element is omitted.
   */
  progress?: number | undefined;
}

/**
 * Sticky session header for the Refined Bubbles chat shell.
 *
 * Anatomy (per locked Option 4 mock):
 *   [ tint-dot  GLYPH · MODE ]   italic display title   [ 25%  ▓░░░ ]
 *
 * The tint dot color flows through the `--head-tint` CSS custom property so
 * downstream rules don't need to enumerate modes.
 */
export function SessionHead({ modeId, title, progress }: SessionHeadProps): JSX.Element {
  const meta = getModeMeta(modeId);
  const tint = meta.tint;

  const pct = progress !== undefined ? Math.round(progress * 100) : undefined;

  return (
    <header
      className={styles.head}
      style={{ "--head-tint": tint } as CSSProperties}
      data-mode={modeId}
    >
      <div className={styles.kicker}>
        <span className={styles.kickerDot} aria-hidden="true" />
        <span className={styles.kickerGlyph} aria-hidden="true">
          {meta.ornament}
        </span>
        {meta.name}
      </div>

      <h1 className={styles.title}>{title}</h1>

      {pct !== undefined && (
        <div className={styles.progress}>
          <span aria-hidden="true">{pct}%</span>
          <div
            className={styles.progressBar}
            role="progressbar"
            aria-label={`Progress: ${pct}%`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </header>
  );
}
