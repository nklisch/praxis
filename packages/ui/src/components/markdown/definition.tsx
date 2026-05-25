import type { ReactNode } from "react";
import styles from "../markdown-content.module.css";

export interface DefinitionProps {
  /** The normalized term this node represents. */
  term: string;
  /**
   * Whether this is the student's first encounter with the term in this
   * render context. When true the `.definition` CSS class is applied,
   * giving the term semibold weight + accent underline. Subsequent mentions
   * render as plain prose (`<dfn>` without styling).
   */
  isFirstOccurrence: boolean;
  children: ReactNode;
}

/**
 * Presentational component for a `[[def:term]]` definition marker.
 *
 * Renders a `<dfn>` element so that screen readers and browser tooling
 * recognise this as a term definition point. The `.definition` CSS class
 * (semibold + accent underline) is only applied on first occurrence;
 * subsequent mentions render as unstyled `<dfn>` to avoid visual noise.
 *
 * CSS lives in `markdown-content.module.css`; no inline styles.
 */
export function Definition({ term, isFirstOccurrence, children }: DefinitionProps) {
  return (
    <dfn title={term} className={isFirstOccurrence ? styles.definition : undefined}>
      {children}
    </dfn>
  );
}
