import type { JSX } from "react";
import { useUpdateCheck } from "../hooks/use-update-check.js";
import { COPY } from "../lib/copy.js";
import styles from "./update-banner.module.css";

/**
 * Renders a small dismissible banner when a newer version of Praxis is
 * available per the configured update feed. Returns null when no update,
 * still loading, or already dismissed for the current latest version.
 *
 * The current version is read by the main process from `app.getVersion()`
 * and threaded through the IPC handler — this component takes no props.
 */
export function UpdateBanner(): JSX.Element | null {
  const { result, dismiss, dismissed } = useUpdateCheck();

  if (!result || result.status !== "available" || dismissed) return null;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.message}>
        {COPY.update.available(result.latest.version)}
      </span>
      <a
        className={styles.downloadLink}
        href={result.latest.downloadUrl}
        target="_blank"
        rel="noreferrer noopener"
      >
        {COPY.update.downloadLabel}
      </a>
      <button
        type="button"
        className={styles.dismissButton}
        onClick={dismiss}
        aria-label={COPY.update.dismissLabel}
      >
        ×
      </button>
    </div>
  );
}
