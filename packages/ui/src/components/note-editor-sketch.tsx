/**
 * Phase 15a: NoteEditorSketch — workspace sketch-note editor.
 *
 * Renders a full-canvas tldraw editor that fills the workspace pane.
 * Auto-saves via a 2-second debounce on canvas changes; explicit save
 * is handled by the parent (NoteEditorPage footer button).
 *
 * The note body stores only the tldraw snapshot JSON (not the rendered PNG).
 * Vision OCR for sketch notes is deferred to Phase 15.x.
 */
import type { NoteId } from "@praxis/core/types";
import { useCallback, useRef } from "react";
import { type SketchCanvasHandle, SketchCanvas } from "./sketch-canvas.js";
import styles from "./note-editor-sketch.module.css";

export interface NoteEditorSketchProps {
  noteId: NoteId;
  /** The initial tldraw snapshot (from note body.snapshot). Undefined for new notes. */
  initialSnapshot?: unknown;
  /**
   * Called when the canvas changes (debounced 2s internally). Receives the raw
   * tldraw snapshot for storage in the note body.
   *
   * The parent (NoteEditorPage) owns the actual save call to client.notes.update.
   */
  onSave: (snapshot: unknown) => Promise<void>;
}

export function NoteEditorSketch({ noteId: _noteId, initialSnapshot, onSave }: NoteEditorSketchProps) {
  const sketchHandleRef = useRef<SketchCanvasHandle>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (snapshot: unknown) => {
      // Debounce saves to 2s — more generous than the 500ms canvas debounce to
      // avoid hammering client.notes.update on every brushstroke.
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = setTimeout(() => {
        onSave(snapshot).catch(() => {
          // Auto-save failure is silent; the user can retry via the Save button.
        });
      }, 2000);
    },
    [onSave],
  );

  return (
    <div className={styles.editorWrapper}>
      <SketchCanvas
        variant="full"
        initialSnapshot={initialSnapshot}
        onChange={handleChange}
        handleRef={sketchHandleRef}
      />
    </div>
  );
}
