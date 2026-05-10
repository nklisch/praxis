import type { JSX } from "react";
import styles from "./thinking-indicator.module.css";

export interface ThinkingIndicatorProps {
  variant?: "dots" | "compact";
}

export function ThinkingIndicator(_props: ThinkingIndicatorProps): JSX.Element {
  return (
    <p className={styles.indicator} aria-live="polite" aria-atomic="true">
      <span className={styles.label}>Thinking</span>
      <span className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </p>
  );
}
