import type { ReactNode } from "react";
import styles from "../markdown-content.module.css";

export type FigureVerdict = "ok" | "check";

export interface FigureProps {
  caption?: string;
  verdict?: FigureVerdict;
  children: ReactNode;
}

// `?? ""` fallbacks: noUncheckedIndexedAccess widens Record<string,string>
// index access to `string | undefined`; CSS module keys here are all
// statically declared in markdown-content.module.css so the "" branch is
// unreachable in practice.
const VERDICT_CLASS: Record<FigureVerdict, string> = {
  ok: styles.figureVerdictOk ?? "",
  check: styles.figureVerdictCheck ?? "",
};

const VERDICT_GLYPH: Record<FigureVerdict, string> = {
  ok: "✓",
  check: "?",
};

/**
 * Presentational figure / worked-example block.  Rendered by the `components`
 * map in `MarkdownContent` for `<figure caption="..." verdict="ok">` HAST
 * elements emitted by the directive plugin.
 *
 * Layout:
 *   - `.figureBody`  — prose body (always present)
 *   - `.figureCaption` — optional mono kicker; contains verdict glyph when set
 *
 * CSS lives entirely in `markdown-content.module.css`; no inline styles.
 */
export function Figure({ caption, verdict, children }: FigureProps) {
  return (
    <figure className={styles.figure}>
      <div className={styles.figureBody}>{children}</div>
      {caption !== undefined && (
        <figcaption className={styles.figureCaption}>
          <span>{caption}</span>
          {verdict !== undefined && (
            <span
              className={`${styles.figureVerdict} ${VERDICT_CLASS[verdict]}`}
              role="img"
              aria-label={verdict === "ok" ? "correct" : "check your work"}
            >
              {VERDICT_GLYPH[verdict]}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
