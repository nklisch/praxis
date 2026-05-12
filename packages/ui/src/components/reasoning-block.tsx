import { type JSX, useState } from "react";
import styles from "./reasoning-block.module.css";

export interface ReasoningBlockProps {
  content: string;
  /** True while still receiving thinking events; renders a faint live dot. */
  streaming: boolean;
}

export function ReasoningBlock({ content, streaming }: ReasoningBlockProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const summary = summarize(content);

  return (
    <div className={styles.block}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.chevron} aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span className={styles.summaryText}>
          {streaming ? "thinking" : "thought"}
          {summary && ` about ${summary}`}
          {streaming && (
            <span className={styles.live} aria-hidden="true">
              ·
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div className={styles.body}>
          <p className={styles.bodyText}>{content}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Reduce thinking text to a short topical hint. Strips markdown chars,
 * takes the first meaningful clause, trims to ~60 chars.
 * Returns empty string when nothing usable.
 */
export function summarize(content: string): string {
  // Split on sentence/clause boundaries (including newlines) BEFORE collapsing whitespace,
  // so multi-line thinking content respects paragraph breaks.
  const firstClause = content.split(/[.!?\n]/)[0] ?? content;
  const cleaned = firstClause
    .replace(/[*_`#>[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return "";
  const trimmed = cleaned.slice(0, 60).trimEnd();
  return trimmed.length < cleaned.length ? `${trimmed}…` : trimmed;
}
