import type { NoteId, SessionId } from "@praxis/core/types";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./inline-note-panel.module.css";
import type { CornellBody } from "./note-editor-cornell.js";
import { NoteEditorCornell } from "./note-editor-cornell.js";
import type { InlineNoteFormat } from "./note-format-picker-popover.js";

export interface InlineNotePanelProps {
  /** The note format to render (only Cornell shown in-panel; others fall back gracefully). */
  format: InlineNoteFormat;
  /** Session the note is linked to. */
  sessionId: SessionId;
  /** Pre-filled title — defaults to "New note". */
  initialTitle?: string;
  /** Pre-filled quoted phrase for the first notes-column entry. */
  quotedPhrase?: string;
  /** Called with the created NoteId after successful save. */
  onSaved: (noteId: NoteId) => void;
  /** Called when the panel should close (Esc or dismiss button). */
  onDismiss: () => void;
  /** Called when the user wants to pop out to the full workspace editor. */
  onPopOut?: () => void;
  /**
   * Inline style applied to the panel root — used by the parent to apply the
   * persisted width from `useResizableWidth` (mirrors ChatRightPanel).
   */
  style?: React.CSSProperties;
}

const INITIAL_CORNELL: CornellBody = {
  kind: "cornell",
  questions: [""],
  details: [""],
  summary: "",
};

/**
 * Inline note panel — slides in from the right in the chat workspace,
 * temporarily replacing the concepts panel.
 *
 * Matches the locked chat-to-workspace-note flow (step 3/5):
 *  - Panel header: glyph + "cornell note · linked to …" + esc badge.
 *  - Body: title input + link line + NoteEditorCornell (mini layout).
 *  - Footer: saving indicator + dismiss/save buttons.
 *  - Esc key dismisses.
 *  - Save persists via `client.notes.create` with contextJson.sessionId set.
 */
export function InlineNotePanel({
  format,
  sessionId,
  initialTitle = "New note",
  quotedPhrase,
  onSaved,
  onDismiss,
  onPopOut,
  style,
}: InlineNotePanelProps): JSX.Element {
  const client = usePraxisClient();

  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState<CornellBody>(() => {
    if (quotedPhrase) {
      return {
        kind: "cornell",
        questions: [""],
        details: [quotedPhrase],
        summary: "",
      };
    }
    return INITIAL_CORNELL;
  });
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus the title input when the panel opens.
  useEffect(() => {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, []);

  // Esc dismisses (lower priority than the format-picker's capture handler,
  // which is already gone by the time this panel mounts).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const note = await client.notes.create({
        format: "cornell",
        body,
        context: { sessionId },
      });
      onSaved(note.id);
    } finally {
      setSaving(false);
    }
  }, [client, saving, body, sessionId, onSaved]);

  // ⌘↵ / Ctrl+↵ saves
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  const formatLabel =
    format === "cornell"
      ? "cornell note"
      : format === "feynman"
        ? "feynman note"
        : format === "outline"
          ? "outline note"
          : format === "sketch"
            ? "sketch note"
            : "free note";

  return (
    <aside
      className={styles.panel}
      style={style}
      aria-label="Inline note editor"
      data-testid="inline-note-panel"
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className={styles.panelHead}>
        <span className={styles.headGlyph} aria-hidden>
          ¶
        </span>
        <span className={styles.headKicker}>{formatLabel} · linked to session</span>
        <span className={styles.headSpacer} />
        {onPopOut && (
          <button
            type="button"
            className={styles.popOutBtn}
            onClick={onPopOut}
            aria-label="Open in full editor"
          >
            ↗ pop out
          </button>
        )}
        <span className={styles.escBadge} aria-hidden>
          esc
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className={styles.panelBody}>
        <input
          ref={titleInputRef}
          className={styles.titleInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title…"
          aria-label="Note title"
          data-testid="inline-note-title"
        />
        <div className={styles.linkLine}>
          linked to session · <strong>just now</strong>
        </div>

        {/* All formats use the Cornell editor inline until their dedicated
            editors land in sibling stories. */}
        <NoteEditorCornell body={body} onChange={setBody} />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className={styles.panelFoot}>
        <span className={styles.savingIndicator}>
          <span className={styles.savingDot} aria-hidden />
          saving as you type
        </span>
        <span className={styles.keepGoingHint}>
          or <em>esc</em> to dismiss
        </span>
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={onDismiss}
          aria-label="Dismiss note panel"
          data-testid="inline-note-dismiss"
        >
          Dismiss
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void handleSave()}
          disabled={saving}
          aria-label="Save note"
          data-testid="inline-note-save"
        >
          {saving ? "Saving…" : "Save ⌘↵"}
        </button>
      </div>
    </aside>
  );
}
