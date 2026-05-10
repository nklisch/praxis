/**
 * Phase 13 → 15a: Controlled composer textarea.
 *
 * A ref is forwarded to the underlying <textarea> so parents can call .focus()
 * after a chip prefill without an internal imperative handle.
 *
 * Phase 15a adds:
 *   - sketchEnabled prop — when true, renders a "✎ Sketch" toggle
 *   - onSend receives an optional sketchId (already captured by ComposerSketch)
 *   - ComposerSketch expands above the textarea when the toggle is active
 */
import type { SketchId } from "@praxis/core/types";
import { type FormEvent, forwardRef, useState } from "react";
import { COPY } from "../lib/copy.js";
import styles from "./composer.module.css";
import { ComposerSketch } from "./composer-sketch.js";

export interface ComposerProps {
  /** Controlled value — parent owns the textarea content. */
  value: string;
  /** Called on every keystroke. */
  onChange: (value: string) => void;
  /**
   * Called on Enter (or send button). The composer does not clear itself;
   * the parent is responsible for calling onChange("") after sending.
   *
   * sketchId is set when the user has captured a sketch via the "✎ Sketch"
   * affordance before sending. The parent appends the [sketch:<id>] marker.
   */
  onSend: (message: string, sketchId?: SketchId) => void;
  disabled?: boolean;
  /**
   * Phase 15a: when true, renders a "✎ Sketch" toggle that expands an inline
   * canvas above the textarea. Requires PraxisClientProvider to be in the tree
   * (ComposerSketch calls client.sketches.put).
   */
  sketchEnabled?: boolean;
}

/**
 * Dumb controlled composer textarea. Value and clearing are owned by the parent
 * so external surfaces (the chip rail) can prefill the textarea.
 */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { value, onChange, onSend, disabled = false, sketchEnabled = false },
  ref,
) {
  const [sketchOpen, setSketchOpen] = useState(false);
  const [capturedSketchId, setCapturedSketchId] = useState<SketchId | undefined>(undefined);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, capturedSketchId);
    // Reset sketch state after sending
    setCapturedSketchId(undefined);
    setSketchOpen(false);
  };

  const handleSketchCaptured = (sketchId: SketchId) => {
    setCapturedSketchId(sketchId);
    setSketchOpen(false);
  };

  const handleSketchCancel = () => {
    setSketchOpen(false);
  };

  return (
    <div className={styles.composerWrapper}>
      {/* Inline sketch expansion — animates open/close via max-height */}
      {sketchEnabled && (
        <div className={`${styles.sketchContainer} ${sketchOpen ? styles.sketchOpen : ""}`}>
          {sketchOpen && (
            <ComposerSketch onCaptured={handleSketchCaptured} onCancel={handleSketchCancel} />
          )}
        </div>
      )}

      {/* Sketch-attached indicator */}
      {capturedSketchId && (
        <div className={styles.sketchAttached}>
          <span>✓ Sketch attached</span>
          <button
            type="button"
            className={styles.sketchDetachBtn}
            onClick={() => setCapturedSketchId(undefined)}
            aria-label="Remove attached sketch"
          >
            ×
          </button>
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          ref={ref}
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder={COPY.composer.placeholder}
          rows={3}
          disabled={disabled}
        />
        <div className={styles.buttonGroup}>
          {sketchEnabled && (
            <button
              type="button"
              className={`${styles.sketchToggleBtn} ${sketchOpen ? styles.sketchToggleActive : ""}`}
              onClick={() => setSketchOpen((prev) => !prev)}
              disabled={disabled || capturedSketchId !== undefined}
              aria-label={COPY.composer.sketchToggleAriaLabel}
              title={COPY.composer.sketchToggleAriaLabel}
            >
              ✎
            </button>
          )}
          <button type="submit" className={styles.sendButton} disabled={disabled || !value.trim()}>
            Send
          </button>
        </div>
      </form>
    </div>
  );
});
