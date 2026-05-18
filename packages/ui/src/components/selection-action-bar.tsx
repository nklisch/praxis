/**
 * SelectionActionBar — floating action bar that appears above selected text
 * in the document viewer.
 *
 * Four actions: + note · ↗ ask Praxis · + cite · + flashcard.
 *
 * Positioning: rendered via a React portal at `document.body` so it floats
 * above all content. The `rect` prop is the Selection's `getBoundingClientRect()`
 * — the bar is pinned 8px above the top of the selection, horizontally centred.
 *
 * Dismiss triggers:
 *   - `mousedown` outside the bar element.
 *   - `Escape` keydown.
 *   - Caller sets `visible={false}` (when selection becomes empty).
 *
 * Each action button calls the matching async handler prop; buttons are
 * disabled while any handler is pending.
 */

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./selection-action-bar.module.css";

export interface SelectionActionBarHandlers {
  /** + note — create a free note from the selected text. */
  onNote: () => Promise<void>;
  /** ↗ ask Praxis — spawn a teach session scoped to the selected passage. */
  onAskPraxis: () => Promise<void>;
  /** + cite — record the selected passage as a citation. */
  onCite: () => Promise<void>;
  /** + flashcard — prompt for a front text then create a flashcard. */
  onFlashcard: () => Promise<void>;
}

export interface SelectionActionBarProps extends SelectionActionBarHandlers {
  /** Whether the bar should be visible. Hidden (returns null) when false. */
  visible: boolean;
  /**
   * Bounding rect of the current selection. Used to position the bar above
   * the selection. Computed from `window.getSelection().getRangeAt(0).getBoundingClientRect()`.
   */
  rect: DOMRect | null;
  /** Called when the bar should dismiss (Escape / outside mousedown). */
  onDismiss: () => void;
}

/**
 * Compute the CSS `left` position so the bar is horizontally centred over
 * `rect`, clamped to stay fully on-screen.
 */
function centredLeft(rect: DOMRect, barWidth: number): number {
  const centred = rect.left + rect.width / 2 - barWidth / 2;
  const minLeft = 8;
  const maxLeft = window.innerWidth - barWidth - 8;
  return Math.max(minLeft, Math.min(maxLeft, centred));
}

/**
 * Compute the CSS `top` position: 8px above the top of the selection rect,
 * but never off the top of the viewport.
 */
function aboveTop(rect: DOMRect, barHeight: number): number {
  const preferred = rect.top - barHeight - 8;
  return Math.max(8, preferred);
}

export function SelectionActionBar({
  visible,
  rect,
  onDismiss,
  onNote,
  onAskPraxis,
  onCite,
  onFlashcard,
}: SelectionActionBarProps): JSX.Element | null {
  const barRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);

  // Dismiss on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, onDismiss]);

  // Dismiss on mousedown outside the bar
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onDismiss]);

  if (!visible || !rect) return null;

  const run = (handler: () => Promise<void>) => async () => {
    setPending(true);
    try {
      await handler();
    } finally {
      setPending(false);
      onDismiss();
    }
  };

  // Estimate bar size for initial positioning; 8px is generous padding.
  // We use a ballpark width — the bar will reposition itself once mounted,
  // but for v1 the estimate (≈ 280px wide × 32px tall) is close enough.
  const BAR_W = 280;
  const BAR_H = 32;
  const left = centredLeft(rect, BAR_W);
  const top = aboveTop(rect, BAR_H);

  const bar = (
    <div
      ref={barRef}
      className={styles.bar}
      style={{ left, top }}
      role="toolbar"
      aria-label="Selection actions"
      // Prevent the bar's own mousedown from clearing the browser selection.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={styles.action}
        disabled={pending}
        onClick={run(onNote)}
        aria-label="Add note from selection"
        title="Create a free note from this passage"
      >
        <span className={styles.glyph}>+</span> note
      </button>

      <div className={styles.sep} aria-hidden="true" />

      <button
        type="button"
        className={styles.action}
        disabled={pending}
        onClick={run(onAskPraxis)}
        aria-label="Ask Praxis about selection"
        title="Open a teach session focused on this passage"
      >
        <span className={styles.glyph}>↗</span> ask Praxis
      </button>

      <div className={styles.sep} aria-hidden="true" />

      <button
        type="button"
        className={styles.action}
        disabled={pending}
        onClick={run(onCite)}
        aria-label="Cite selection"
        title="Record this passage as a citation"
      >
        <span className={styles.glyph}>+</span> cite
      </button>

      <div className={styles.sep} aria-hidden="true" />

      <button
        type="button"
        className={styles.action}
        disabled={pending}
        onClick={run(onFlashcard)}
        aria-label="Add flashcard from selection"
        title="Create a flashcard using this passage as the back"
      >
        <span className={styles.glyph}>+</span> flashcard
      </button>
    </div>
  );

  return createPortal(bar, document.body);
}
