import { getToolLabel, getToolSummary } from "@praxis/tools/labels";
import type { JSX } from "react";
import styles from "./tool-call-disclosure.module.css";

export type ToolCallVerdict = "ok" | "error" | "running";

export interface ToolCallDisclosureProps {
  toolName: string;
  verdict: ToolCallVerdict;
  /** Tool input args, displayed in expanded view. */
  input?: unknown;
  /** Tool result output, used for result preview and expanded view. */
  output?: unknown;
  /** Error message shown in expanded view when verdict is "error". */
  errorMessage?: string;
}

/** Unicode glyphs for each verdict state. */
const VERDICT_GLYPH: Record<ToolCallVerdict, string> = {
  ok: "✓",
  error: "⊘",
  running: "…",
};

/**
 * Generic tool-call disclosure for all chat surfaces.
 *
 * Collapsed (one line): verdict glyph · tool name · result preview · chevron.
 * Expanded: same header + full I/O block (args + result, monospace).
 *
 * Uses a native <details> element for the expand/collapse behavior.
 * Hidden tools (label.hidden === true) render null.
 *
 * Separate from ToolEntry (which uses a custom button and the older design
 * language). This component is the redesign-era disclosure and implements the
 * locked Option-4 mock visual contract.
 */
export function ToolCallDisclosure(props: ToolCallDisclosureProps): JSX.Element | null {
  const { toolName, verdict, input, output, errorMessage } = props;

  const label = getToolLabel(toolName);
  if (label.hidden) return null;

  const glyphClass =
    verdict === "ok"
      ? styles.glyphOk
      : verdict === "error"
        ? styles.glyphError
        : styles.glyphRunning;

  // Result preview: try the registered summarizer first, then fall back to
  // the past-tense label, then the present-tense label.
  const resultPreview =
    verdict === "error"
      ? (errorMessage ?? `Failed: ${label.present.toLowerCase()}`)
      : (getToolSummary(toolName, output) ?? label.past ?? label.present);

  const hasDetails = input !== undefined || output !== undefined || errorMessage !== undefined;

  return (
    <details className={styles.disclosure}>
      <summary className={styles.summary}>
        <span className={`${styles.glyph} ${glyphClass}`} aria-hidden="true">
          {VERDICT_GLYPH[verdict]}
        </span>
        <span className={styles.name}>{toolName}</span>
        {resultPreview !== undefined && (
          <span className={styles.resultPreview}>— {resultPreview}</span>
        )}
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </summary>
      {hasDetails && (
        <div className={styles.detail}>
          {input !== undefined && (
            <section className={styles.detailSection}>
              <h4 className={styles.detailHeading}>Input</h4>
              <pre className={styles.detailPre}>{JSON.stringify(input, null, 2)}</pre>
            </section>
          )}
          {output !== undefined && (
            <section className={styles.detailSection}>
              <h4 className={styles.detailHeading}>Output</h4>
              <pre className={styles.detailPre}>{JSON.stringify(output, null, 2)}</pre>
            </section>
          )}
          {errorMessage !== undefined && (
            <section className={styles.detailSection}>
              <h4 className={styles.detailHeading}>Error</h4>
              <pre className={styles.detailPre}>{errorMessage}</pre>
            </section>
          )}
        </div>
      )}
    </details>
  );
}
