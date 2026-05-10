import { getToolLabel } from "@praxis/tools/labels";
import type { JSX } from "react";
import styles from "./tool-interstitial.module.css";

export interface ToolInterstitialProps {
  toolName: string;
  status: "in_flight" | "settled";
  errored?: boolean;
}

export function ToolInterstitial({
  toolName,
  status,
  errored,
}: ToolInterstitialProps): JSX.Element | null {
  const label = getToolLabel(toolName);
  if (label.hidden) return null;

  if (status === "in_flight") {
    return (
      <p className={styles.interstitial} aria-live="polite">
        <span className={styles.text}>{label.present}</span>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </p>
    );
  }

  if (errored) {
    return (
      <p className={`${styles.interstitial} ${styles.errored}`}>
        {`Couldn't finish ${label.present.toLowerCase()}.`}
      </p>
    );
  }

  if (label.past !== undefined) {
    return <p className={`${styles.interstitial} ${styles.settled}`}>{label.past}</p>;
  }

  return null;
}
