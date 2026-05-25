import type { ReactNode } from "react";
import styles from "../markdown-content.module.css";

export type CalloutType = "theorem" | "lemma" | "hint" | "warning";

export interface CalloutProps {
  type: CalloutType;
  children: ReactNode;
}

const TYPE_LABEL: Record<CalloutType, string> = {
  theorem: "Theorem",
  lemma: "Lemma",
  hint: "Hint",
  warning: "Warning",
};

// `?? ""` fallbacks: noUncheckedIndexedAccess widens Record<string,string>
// index access to `string | undefined`; CSS module keys here are all
// statically declared in markdown-content.module.css so the "" branch is
// unreachable in practice.
const TYPE_CLASS: Record<CalloutType, string> = {
  theorem: styles.calloutTheorem ?? "",
  lemma: styles.calloutLemma ?? "",
  hint: styles.calloutHint ?? "",
  warning: styles.calloutWarning ?? "",
};

/**
 * Presentational callout block for theorem / lemma / hint / warning
 * admonitions.  Rendered by the `components` map in `MarkdownContent` for the
 * custom `<admonition type="...">` HAST elements emitted by `remarkAdmonitions`.
 *
 * CSS lives entirely in `markdown-content.module.css`; no inline styles.
 */
export function Callout({ type, children }: CalloutProps) {
  return (
    <aside className={`${styles.callout} ${TYPE_CLASS[type]}`} role="note">
      <span className={styles.calloutIcon} aria-hidden="true">
        {TYPE_LABEL[type]}
      </span>
      <div className={styles.calloutBody}>{children}</div>
    </aside>
  );
}
