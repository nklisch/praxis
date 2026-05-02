import type { JSX } from "react";
import styles from "./composer-verbs.module.css";
import { getVerbsForMode } from "./composer-verbs-meta.js";

export interface ComposerVerbsProps {
  /** Active session's mode — drives which verbs render. */
  modeId: string | undefined;
  /**
   * Called when a chip is tapped. Receives the verb text with a trailing space
   * (e.g. "explain "). Chips deliver starter words, not finished prompts.
   */
  onPrefill: (text: string) => void;
}

/**
 * Mode-aware chip rail that sits between the message log and the composer.
 * Each chip prefills the textarea with a tutor-verb + trailing space so the
 * student keeps typing — tapping a chip never autosends.
 *
 * Renders null when modeId is undefined (no active session).
 */
export function ComposerVerbs({ modeId, onPrefill }: ComposerVerbsProps): JSX.Element | null {
  if (modeId === undefined) return null;

  const verbs = getVerbsForMode(modeId);

  return (
    <div className={styles.row} role="toolbar" aria-label="Tutor verbs">
      {verbs.map((verb) => (
        <button
          key={verb}
          type="button"
          className={styles.chip}
          onClick={() => onPrefill(`${verb} `)}
        >
          {verb}
        </button>
      ))}
    </div>
  );
}
