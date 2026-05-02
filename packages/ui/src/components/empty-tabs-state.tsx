import type { JSX } from "react";
import { COPY } from "../lib/copy.js";
import styles from "./empty-tabs-state.module.css";

export interface EmptyTabsStateProps {
  onNew: () => void;
}

/** Editorial empty state shown when no tabs are open in the chat workspace. */
export function EmptyTabsState({ onNew }: EmptyTabsStateProps): JSX.Element {
  return (
    <div className={styles.empty}>
      <span className={styles.ornament} aria-hidden="true">
        ·
      </span>
      <p className={styles.line}>{COPY.empty.tabs}</p>
      <button type="button" className={styles.openBtn} onClick={onNew}>
        Open a session
      </button>
    </div>
  );
}
