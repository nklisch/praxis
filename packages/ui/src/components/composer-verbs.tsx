import { type JSX, useState } from "react";
import styles from "./composer-verbs.module.css";
import { getVerbsForMode } from "./composer-verbs-meta.js";
import type { InlineNoteFormat } from "./note-format-picker-popover.js";
import { NoteFormatPickerPopover } from "./note-format-picker-popover.js";

export interface ComposerVerbsProps {
  /** Active session's mode — drives which verbs render. */
  modeId: string | undefined;
  /**
   * Called when a chip is tapped. Receives the verb text with a trailing space
   * (e.g. "explain "). Chips deliver starter words, not finished prompts.
   */
  onPrefill: (text: string) => void;
  /**
   * When provided, renders a "+ note" button at the end of the chip rail.
   * Clicking it opens the inline format-picker popover.
   */
  onNoteOpen?: (format: InlineNoteFormat) => void;
  /** Whether a session note already exists (adds a glyph indicator to the button). */
  hasSessionNote?: boolean;
}

/**
 * Mode-aware chip rail that sits between the message log and the composer.
 * Each chip prefills the textarea with a tutor-verb + trailing space so the
 * student keeps typing — tapping a chip never autosends.
 *
 * When `onNoteOpen` is provided, a "+ note" button appears at the right of the
 * chip rail. Clicking it opens the `NoteFormatPickerPopover` inline — the popover
 * anchors to the button and keyboard shortcuts 1–5 select the format.
 * On selection, `onNoteOpen(format)` fires and the popover closes.
 *
 * Renders null when modeId is undefined (no active session).
 */
export function ComposerVerbs({
  modeId,
  onPrefill,
  onNoteOpen,
  hasSessionNote = false,
}: ComposerVerbsProps): JSX.Element | null {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (modeId === undefined) return null;

  const verbs = getVerbsForMode(modeId);

  const handleNoteSelect = (format: InlineNoteFormat) => {
    setPickerOpen(false);
    onNoteOpen?.(format);
  };

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
      {onNoteOpen !== undefined && (
        <div className={styles.notePickerAnchor}>
          <button
            type="button"
            className={`${styles.chip} ${styles.noteChip} ${hasSessionNote ? styles.noteChipHasNote : ""}`}
            onClick={() => setPickerOpen((v) => !v)}
            aria-label={
              hasSessionNote ? "Note taken for this session — open note picker" : "Take a note"
            }
            title={hasSessionNote ? "1 note for this session" : "Take a note"}
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
            data-testid="note-picker-trigger"
          >
            {hasSessionNote ? "¶·" : "+ note"}
          </button>

          {pickerOpen && (
            <NoteFormatPickerPopover
              onSelect={handleNoteSelect}
              onDismiss={() => setPickerOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
