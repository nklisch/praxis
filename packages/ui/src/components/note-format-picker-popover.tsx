import { type JSX, useEffect } from "react";
import styles from "./note-format-picker-popover.module.css";

/**
 * The five note formats surfaced from the chat composer.
 * Sketch is included as format #5 per the mock.
 */
export type InlineNoteFormat = "cornell" | "feynman" | "outline" | "free" | "sketch";

interface FormatInfo {
  id: InlineNoteFormat;
  label: string;
  description: string;
}

const FORMAT_LIST: FormatInfo[] = [
  {
    id: "cornell",
    label: "Cornell",
    description: "cue · notes · summary — for active reading + review",
  },
  { id: "feynman", label: "Feynman", description: "explain it to a 12-year-old; note the gaps" },
  { id: "outline", label: "Outline", description: "hierarchical bullets" },
  { id: "free", label: "Free", description: "just write" },
  { id: "sketch", label: "Sketch", description: "draw it out" },
];

/** Index of the suggested (first/Cornell) format. */
const SUGGESTED_INDEX = 0;

export interface NoteFormatPickerPopoverProps {
  onSelect: (format: InlineNoteFormat) => void;
  onOpenInWorkspace?: () => void;
  onDismiss: () => void;
}

/**
 * Format-picker popover for the inline note flow.
 *
 * Anchors above the "+ note" button in the composer verb rail. Matches the
 * locked chat-to-workspace-note mock (step 2/5):
 *  - Cornell suggested first with accent border + "suggested" badge.
 *  - Numbered keyboard shortcuts 1–5.
 *  - "↗ open in workspace" escape hatch at the bottom.
 *  - Esc dismisses.
 *
 * Positioning is `position: absolute; bottom: 100%` so the parent needs
 * `position: relative`.
 */
export function NoteFormatPickerPopover({
  onSelect,
  onOpenInWorkspace,
  onDismiss,
}: NoteFormatPickerPopoverProps): JSX.Element {
  // Keyboard: 1–5 pick format, Esc dismiss.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss();
        return;
      }
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < FORMAT_LIST.length) {
        const fmt = FORMAT_LIST[idx];
        if (fmt !== undefined) {
          onSelect(fmt.id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onSelect, onDismiss]);

  return (
    <>
      {/* Transparent backdrop closes popover on outside click */}
      <div
        className={styles.backdrop}
        onClick={onDismiss}
        aria-hidden
        data-testid="format-picker-backdrop"
      />

      <div
        className={styles.popover}
        role="dialog"
        aria-modal="true"
        aria-label="Pick a note format"
        data-testid="format-picker-popover"
      >
        <div className={styles.head}>
          <span className={styles.headGlyph} aria-hidden>
            ¶
          </span>
          <h2 className={styles.headTitle}>New note</h2>
          <span className={styles.escBadge} aria-hidden>
            esc
          </span>
        </div>

        <div className={styles.formatListLabel} aria-hidden>
          Pick a format
        </div>

        <ul className={styles.formatList} aria-label="Note formats">
          {FORMAT_LIST.map((fmt, idx) => {
            const isSuggested = idx === SUGGESTED_INDEX;
            return (
              <li key={fmt.id}>
                <button
                  type="button"
                  className={`${styles.formatRow} ${isSuggested ? styles.formatRowSuggested : ""}`}
                  onClick={() => onSelect(fmt.id)}
                  aria-label={`${fmt.label} — ${fmt.description}${isSuggested ? " (suggested)" : ""}`}
                  data-testid={`format-option-${fmt.id}`}
                >
                  <span className={styles.numBadge} aria-hidden>
                    {idx + 1}
                  </span>
                  <span className={styles.formatName}>{fmt.label}</span>
                  <span className={styles.formatDesc}>{fmt.description}</span>
                  {isSuggested && (
                    <span className={styles.suggestedBadge} aria-hidden>
                      suggested
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {onOpenInWorkspace && (
          <>
            <div className={styles.orDivider} aria-hidden>
              — or —
            </div>
            <button
              type="button"
              className={styles.altAction}
              onClick={onOpenInWorkspace}
              aria-label="Open a new note in the workspace tab"
            >
              ↗ open a new note in the workspace tab (full editor, separate tab)
            </button>
          </>
        )}
      </div>
    </>
  );
}
