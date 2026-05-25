import type { MouseEvent, ReactNode } from "react";
import styles from "../markdown-content.module.css";

export interface ConceptRefProps {
  /** The slug identifying the concept-map node (e.g. `"chain-rule"`). */
  conceptSlug: string;
  children: ReactNode;
  /**
   * Called when the link is activated.  When omitted the click is still
   * prevented from navigating (href="#") but no callback fires.
   */
  onOpen?: (slug: string) => void;
}

/**
 * Inline link that surfaces a concept-map node.  Styled with `.conceptRef`
 * (italic + dashed underline + § sigil via CSS `::after`).
 *
 * Wiring: `markdown-content.tsx` (step-8) detects `concept:` href schemes
 * in its `a` component override and delegates to this component.  This file
 * ships the pure presentational piece only.
 */
export function ConceptRef({ conceptSlug, children, onOpen }: ConceptRefProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onOpen?.(conceptSlug);
  };

  return (
    // href="#" is intentional: concept links are in-app navigation handled by
    // onOpen; the hash prevents a page reload while keeping the element
    // keyboard-focusable and visually consistent with prose link styling.
    // biome-ignore lint/a11y/useValidAnchor: concept: links are intentional in-page anchors that trigger onOpen; the href="#" pattern is the design contract for this component
    <a href="#" className={styles.conceptRef} onClick={handleClick}>
      {children}
    </a>
  );
}
