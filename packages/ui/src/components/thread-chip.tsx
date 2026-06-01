/**
 * ThreadChip — inline summary that replaces a resolved or dismissed question
 * card in the chat history. Two visual variants:
 *
 *   "answered"  — brick-accent left border; shows the submitted answer text.
 *   "dismissed" — neutral grey left border; "you asked to discuss in chat".
 *
 * Clicking an answered chip re-expands to a read-only card view (calls
 * `onExpand`). Dismissed chips do not expand.
 */
import { type JSX, useMemo } from "react";
import styles from "./thread-chip.module.css";

export type ThreadChipVariant = "answered" | "dismissed";

export interface ThreadChipProps {
  variant: ThreadChipVariant;
  /** Displayed verb text — e.g. "you answered", "you selected 3". */
  verb: string;
  /** The answer text to display (omit for dismissed variant). */
  answer?: string | undefined;
  /** When the answer was submitted. */
  when: Date;
  /** Called when the user clicks the chip to re-expand the card. */
  onExpand?: (() => void) | undefined;
}

/** Format a Date to HH:MM or "just now" (within 30 seconds). */
function formatWhen(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < 30_000) return "just now";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ThreadChip({
  variant,
  verb,
  answer,
  when,
  onExpand,
}: ThreadChipProps): JSX.Element {
  const whenText = useMemo(() => formatWhen(when), [when]);
  const isDismissed = variant === "dismissed";

  const className = isDismissed ? `${styles.chip} ${styles.chipDismissed}` : styles.chip;

  const handleClick = isDismissed ? undefined : onExpand;

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      aria-label={isDismissed ? undefined : "Expand question"}
      // Dismissed chips are non-interactive; prevent pointer cursor confusion
      style={isDismissed ? { cursor: "default" } : undefined}
    >
      <span className={styles.glyph} aria-hidden="true">
        ↳
      </span>
      <span className={styles.verb}>{verb}</span>
      {answer !== undefined && <span className={styles.answer}>{answer}</span>}
      <span className={styles.when}>{whenText}</span>
      {!isDismissed && onExpand !== undefined && (
        <span className={styles.expand} aria-hidden="true">
          expand
        </span>
      )}
    </button>
  );
}
