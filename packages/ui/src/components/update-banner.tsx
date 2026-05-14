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

  const { latest } = result;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.message}>{COPY.update.available(latest.version)}</span>
      <a
        className={styles.downloadLink}
        href={latest.downloadUrl}
        target="_blank"
        rel="noreferrer noopener"
      >
        {COPY.update.downloadLabel}
      </a>
      {/* Hash block: collapsed by default (no `open` attr), renders the
          full SHA-256 verbatim in <code> (no truncation). Absent entirely
          when `installerSha256` is unset. Pinned by the two
          "renders the SHA-256 hash <details> block ..." tests in
          update-banner.test.tsx. */}
      {latest.installerSha256 && (
        <details className={styles.hashDetails}>
          <summary className={styles.hashSummary}>Verify download · SHA-256</summary>
          <code className={styles.hashValue}>{latest.installerSha256}</code>
          <p className={styles.hashHint}>
            After downloading, run <code>shasum -a 256 &lt;file&gt;</code> (macOS / Linux) or{" "}
            <code>certutil -hashfile &lt;file&gt; SHA256</code> (Windows) and confirm the output
            matches.
          </p>
        </details>
      )}
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
