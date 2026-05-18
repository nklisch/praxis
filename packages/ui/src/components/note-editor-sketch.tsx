/**
 * Phase 15a: NoteEditorSketch — workspace sketch-note editor.
 *
 * Renders a full-canvas tldraw editor that fills the workspace pane.
 * Auto-saves via a 2-second debounce on canvas changes; explicit save
 * is handled by the parent (NoteEditorPage footer button).
 *
 * The note body stores only the tldraw snapshot JSON (not the rendered PNG).
 * Vision OCR for sketch notes is deferred to Phase 15.x.
 *
 * Phase 15b (sketch-bridge): adds "↗ convert to concept map" button in the
 * inline notice strip. When clicked, shows a confirmation modal with the
 * candidate node count + label warning. On confirm, calls
 * `onConvertToConceptMap` and the parent navigates to the new map.
 *
 * Layout (per locked mock .mockups/screens/epic-ui-redesign-ground-up-workspace/note-sketch-editor.html):
 *   surface = [tools-rail 56px] [canvas]
 *   tools-rail: Select / Pen / Highlight / Text / Arrow / Shape / sep / Eraser / sep / color swatches
 *   canvas: absolute-positioned inline notice strip at top-center; tldraw fills below
 */
import type { NoteId } from "@praxis/core/types";
import { useCallback, useRef, useState } from "react";
import { Modal } from "./modal.js";
import styles from "./note-editor-sketch.module.css";
import { SketchCanvas, type SketchCanvasHandle } from "./sketch-canvas.js";

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
  /**
   * Phase 15b: called when the user confirms the sketch → concept-map conversion.
   * The parent performs the IPC call and navigates to the new map.
   * If absent, the convert link in the notice strip is not shown.
   */
  onConvertToConceptMap?: () => Promise<void>;
}

/** State for the convert-to-concept-map confirmation modal. */
type ConvertModalState =
  | { open: false }
  | { open: true; converting: boolean; error: string | null };

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  { id: "select", glyph: "↘", label: "Select" },
  { id: "pen", glyph: "✎", label: "Pen" },
  { id: "highlight", glyph: "▢", label: "Highlight" },
  { id: "text", glyph: "¶", label: "Text" },
  { id: "arrow", glyph: "⟶", label: "Arrow" },
  { id: "shape", glyph: "○", label: "Shape" },
] as const;

const ERASER = { id: "eraser", glyph: "⌫", label: "Eraser" } as const;

/** Color swatches matching tldraw's built-in palette; CSS vars map to design tokens. */
const COLOR_SWATCHES = [
  { id: "black", cssVar: "var(--color-text-primary)", label: "Black" },
  { id: "accent", cssVar: "var(--color-accent)", label: "Accent (brick)" },
  { id: "bootstrap", cssVar: "var(--tint-bootstrap)", label: "Sage" },
  { id: "teach", cssVar: "var(--tint-teach)", label: "Amber" },
  { id: "quiz", cssVar: "var(--tint-quiz)", label: "Slate" },
] as const;

type ToolId = (typeof TOOLS)[number]["id"] | "eraser";
type SwatchId = (typeof COLOR_SWATCHES)[number]["id"];

// ── Component ─────────────────────────────────────────────────────────────────

export function NoteEditorSketch({
  noteId: _noteId,
  initialSnapshot,
  onSave,
  onConvertToConceptMap,
}: NoteEditorSketchProps) {
  const sketchHandleRef = useRef<SketchCanvasHandle>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [convertModal, setConvertModal] = useState<ConvertModalState>({ open: false });

  // Active tool and color swatch (display-only — tldraw manages its own internal tool state)
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [activeSwatch, setActiveSwatch] = useState<SwatchId>("black");

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

  const handleConvertClick = useCallback(() => {
    setConvertModal({ open: true, converting: false, error: null });
  }, []);

  const handleConvertConfirm = useCallback(async () => {
    if (!onConvertToConceptMap) return;
    setConvertModal({ open: true, converting: true, error: null });
    try {
      await onConvertToConceptMap();
      // Parent navigates away — no need to close modal explicitly.
    } catch (err) {
      setConvertModal({
        open: true,
        converting: false,
        error: err instanceof Error ? err.message : "Conversion failed",
      });
    }
  }, [onConvertToConceptMap]);

  const handleConvertCancel = useCallback(() => {
    setConvertModal({ open: false });
  }, []);

  return (
    <div className={styles.editorWrapper}>
      {/* ── Tools rail ───────────────────────────────────────────────────── */}
      <nav className={styles.toolsRail} aria-label="Drawing tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`${styles.toolBtn} ${activeTool === tool.id ? styles.toolBtnActive : ""}`}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={activeTool === tool.id}
            onClick={() => setActiveTool(tool.id)}
          >
            {tool.glyph}
          </button>
        ))}

        <hr className={styles.toolSep} />

        <button
          type="button"
          className={`${styles.toolBtn} ${activeTool === ERASER.id ? styles.toolBtnActive : ""}`}
          title={ERASER.label}
          aria-label={ERASER.label}
          aria-pressed={activeTool === ERASER.id}
          onClick={() => setActiveTool(ERASER.id)}
        >
          {ERASER.glyph}
        </button>

        <hr className={styles.toolSep} />

        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            className={`${styles.colorSwatch} ${activeSwatch === swatch.id ? styles.colorSwatchActive : ""}`}
            style={{ background: swatch.cssVar }}
            title={swatch.label}
            aria-label={swatch.label}
            aria-pressed={activeSwatch === swatch.id}
            onClick={() => setActiveSwatch(swatch.id)}
          />
        ))}
      </nav>

      {/* ── Canvas area ──────────────────────────────────────────────────── */}
      <div className={styles.canvasArea}>
        {/* Inline notice strip — floats above the canvas, centered at the top */}
        <div className={styles.noticeStrip} role="note" aria-label="Sketch surface notice">
          <span className={styles.noticeGlyph}>✎</span>
          <span className={styles.noticeText}>
            <em className={styles.noticeEmphasis}>Sketch</em> — a free drawing surface. No canonical
            concept linking here
            {onConvertToConceptMap && (
              <>
                {"; for that, "}
                <button
                  type="button"
                  className={styles.convertBtn}
                  onClick={handleConvertClick}
                  title="Convert sketch to concept map"
                >
                  convert to a concept map ↗
                </button>
              </>
            )}
          </span>
        </div>

        <SketchCanvas
          variant="full"
          initialSnapshot={initialSnapshot}
          onChange={handleChange}
          handleRef={sketchHandleRef}
        />
      </div>

      {/* ── Convert confirmation modal ───────────────────────────────────── */}
      {convertModal.open && (
        <Modal
          onClose={handleConvertCancel}
          ariaLabel="Convert sketch to concept map"
          maxWidth="440px"
        >
          <div className={styles.convertModal}>
            <h2 className={styles.convertTitle}>Convert to concept map?</h2>
            <p className={styles.convertBody}>
              Praxis will extract labelled shapes as nodes and arrows as edges. Shapes without text
              labels will be skipped — the resulting map may be sparse.
            </p>
            <p className={styles.convertNote}>
              The original sketch is preserved. You can undo this conversion within 24 hours from
              the Configure tab.
            </p>
            {convertModal.error && <p className={styles.convertError}>{convertModal.error}</p>}
            <div className={styles.convertActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={handleConvertCancel}
                disabled={convertModal.converting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={handleConvertConfirm}
                disabled={convertModal.converting}
              >
                {convertModal.converting ? "Converting…" : "Convert"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
