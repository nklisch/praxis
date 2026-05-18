import type { NoteId } from "@praxis/core/types";
import { type JSX, useEffect, useState } from "react";
import styles from "./saved-note-toast.module.css";

export interface SavedNoteToastProps {
  /** The saved note's id — used to construct workspace navigation. */
  noteId: NoteId;
  /** Display title of the saved note. */
  noteTitle: string;
  /** Format label (e.g. "cornell"). */
  formatLabel: string;
  /** Called when the user clicks "↗ workspace". */
  onOpenWorkspace?: () => void;
  /** Auto-dismiss after this many milliseconds (default 5000). */
  autoHideMs?: number;
  /** Called when the toast is dismissed (auto or manual). */
  onDismiss: () => void;
}

/**
 * Confirmation toast shown after an inline note is saved.
 *
 * Matches the locked chat-to-workspace-note flow mock (step 4/5):
 *  - Fixed bottom-right, slides in.
 *  - Shows note title + format label.
 *  - "↗ workspace" link.
 *  - Auto-dismisses after 5 s.
 */
export function SavedNoteToast({
  noteTitle,
  formatLabel,
  onOpenWorkspace,
  autoHideMs = 5000,
  onDismiss,
}: SavedNoteToastProps): JSX.Element | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, autoHideMs);
    return () => clearTimeout(timer);
  }, [autoHideMs, onDismiss]);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss();
  };

  return (
    <div
      className={styles.toast}
      role="status"
      aria-live="polite"
      aria-label="Note saved"
      data-testid="saved-note-toast"
    >
      <span className={styles.glyph} aria-hidden>
        ¶
      </span>
      <div className={styles.text}>
        <strong>Saved.</strong> "{noteTitle}" · <em>{formatLabel}</em> · linked to session.
      </div>
      <div className={styles.actions}>
        {onOpenWorkspace && (
          <button
            type="button"
            className={styles.workspaceLink}
            onClick={onOpenWorkspace}
            aria-label="Open workspace"
          >
            ↗ workspace
          </button>
        )}
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={handleDismiss}
          aria-label="Dismiss toast"
          data-testid="saved-note-toast-dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
