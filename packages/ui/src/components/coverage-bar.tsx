/**
 * CoverageBar — a thin horizontal progress bar showing a 0–1 coverage ratio.
 *
 * The outer rail uses `flex: 1` so it expands to fill its parent. Place this
 * inside a flex container (e.g. `display: flex; align-items: center`) to get
 * the intended expanding-bar layout, as seen in the concept-map row mockups.
 */

import type { ReactElement } from "react";
import styles from "./coverage-bar.module.css";

export interface CoverageBarProps {
  /** 0..1; values outside this range are clamped */
  percent: number;
  /** compact mode: 3px height (default 4px) */
  compact?: boolean;
  /** optional aria-label; default "Coverage: N%" */
  ariaLabel?: string;
}

export function CoverageBar({ percent, compact, ariaLabel }: CoverageBarProps): ReactElement {
  const clamped = Math.min(1, Math.max(0, percent));
  const pct = Math.round(clamped * 100);
  const label = ariaLabel ?? `Coverage: ${pct}%`;

  return (
    <div
      className={`${styles.coverageBar}${compact ? ` ${styles["coverageBar--compact"]}` : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={styles.coverageBarFill} style={{ width: `${pct}%` }} />
    </div>
  );
}
