import type { JSX } from "react";
import { COPY } from "../lib/copy.js";
import styles from "./loading-state.module.css";

export interface LoadingStateProps {
  /** Italic ellipsis copy. Defaults to COPY.loading.default */
  message?: string;
}

/** Quiet editorial loading indicator — a slow italic ellipsis, not a spinner label. */
export function LoadingState({ message = COPY.loading.default }: LoadingStateProps): JSX.Element {
  return <p className={styles.loading}>{message}</p>;
}
