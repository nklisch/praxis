import { getToolLabel, getToolSummary } from "@praxis/tools/labels";
import { type JSX, useState } from "react";
import styles from "./tool-entry.module.css";

export interface ToolEntryProps {
  toolName: string;
  status: "in_flight" | "settled" | "errored";
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
}

/**
 * Thread-persistent tool call artifact. Renders in three states:
 * - in_flight: present-tense label + animated dots (same as old ToolInterstitial).
 * - settled: collapsed one-line summary with disclosure triangle; click to expand
 *   and view raw input + output JSON.
 * - errored: collapsed error summary (red-ish); click to expand and view details.
 *
 * Hidden tools (`getToolLabel(name).hidden === true`) render null regardless of status.
 */
export function ToolEntry(props: ToolEntryProps): JSX.Element | null {
  const label = getToolLabel(props.toolName);
  // Move expansion state unconditionally above the hidden guard to satisfy hook ordering rules.
  const [expanded, setExpanded] = useState(false);
  if (label.hidden) return null;

  const { toolName, status, input, output, errorMessage } = props;

  if (status === "in_flight") {
    return (
      <p className={styles.entry} aria-live="polite">
        <span className={styles.text}>{label.present}</span>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </p>
    );
  }

  const summary =
    status === "errored"
      ? `Couldn't finish ${label.present.toLowerCase()}.`
      : (getToolSummary(toolName, output) ?? label.past ?? label.present);

  const hasDetails = input !== undefined || output !== undefined || errorMessage !== undefined;

  return (
    <div
      className={`${styles.entry} ${styles.collapsible} ${status === "errored" ? styles.errored : styles.settled}`}
    >
      <button
        type="button"
        className={styles.summary}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        disabled={!hasDetails}
      >
        <span className={styles.disclosure} aria-hidden="true">
          {hasDetails ? (expanded ? "▾" : "▸") : "·"}
        </span>
        <span className={styles.text}>{summary}</span>
      </button>
      {expanded && hasDetails && (
        <div className={styles.details}>
          {input !== undefined && (
            <details open>
              <summary>Input</summary>
              <pre className={styles.detailPre}>{JSON.stringify(input, null, 2)}</pre>
            </details>
          )}
          {output !== undefined && (
            <details open>
              <summary>Output</summary>
              <pre className={styles.detailPre}>{JSON.stringify(output, null, 2)}</pre>
            </details>
          )}
          {errorMessage !== undefined && (
            <details open>
              <summary>Error</summary>
              <pre className={styles.detailPre}>{errorMessage}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
