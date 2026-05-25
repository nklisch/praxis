/**
 * Phase 13 → 15a → composer-async-behavior: Controlled composer textarea.
 *
 * A ref is forwarded to the underlying <textarea> so parents can call .focus()
 * after a chip prefill without an internal imperative handle.
 *
 * Phase 15a adds:
 *   - sketchEnabled prop — when true, renders a "✎ Sketch" toggle
 *   - onSend receives an optional sketchId (already captured by ComposerSketch)
 *   - ComposerSketch expands above the textarea when the toggle is active
 *
 * composer-async-behavior (step 2):
 *   - `isStreaming` prop drives the Send ↔ Stop button morph
 *   - `onCancel` prop fires when the Stop button is clicked
 *   - `disabled` prop removed — composer accepts input regardless of streaming state
 *   - Enter-to-send only fires when `value` non-empty AND `isStreaming === false`
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
   * Called on Enter (or Send button click) when not streaming. The composer
   * does not clear itself; the parent is responsible for calling onChange("")
   * after sending.
   *
   * sketchId is set when the user has captured a sketch via the "✎ Sketch"
   * affordance before sending. The parent appends the [sketch:<id>] marker.
   */
  onSend: (message: string, sketchId?: SketchId) => void;
  /**
   * When `true`, the Send button morphs into a Stop (■) button and clicking
   * it fires `onCancel`. Enter-to-send is suppressed while streaming.
   */
  isStreaming: boolean;
  /**
   * Fired when the Stop button is clicked (i.e. when `isStreaming === true`).
   * Should cancel the active tutor turn via the AbortController path.
   */
  onCancel: () => void;
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
 *
 * The Send button morphs to a Stop button while `isStreaming` is true — the same
 * DOM element swaps class and click handler so focus is preserved through the
 * transition. Enter submits only when non-empty AND not streaming.
 */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { value, onChange, onSend, isStreaming, onCancel, sketchEnabled = false },
  ref,
) {
  const [sketchOpen, setSketchOpen] = useState(false);
  const [capturedSketchId, setCapturedSketchId] = useState<SketchId | undefined>(undefined);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Enter-to-send is suppressed while streaming — Stop is an explicit action.
    if (isStreaming) return;
    const trimmed = value.trim();
    if (!trimmed) return;
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
    <div className={styles.composer}>
      {/* Inline sketch expansion — animates open/close via max-height */}
      {sketchEnabled && (
        <div
          className={`${styles["composer__sketch-container"]} ${sketchOpen ? styles["composer__sketch-container--open"] : ""}`}
        >
          {sketchOpen && (
            <ComposerSketch onCaptured={handleSketchCaptured} onCancel={handleSketchCancel} />
          )}
        </div>
      )}

      {/* Sketch-attached indicator */}
      {capturedSketchId && (
        <div className={styles["composer__sketch-attached"]}>
          <span>✓ Sketch attached</span>
          <button
            type="button"
            className={styles["composer__sketch-detach"]}
            onClick={() => setCapturedSketchId(undefined)}
            aria-label="Remove attached sketch"
          >
            ×
          </button>
        </div>
      )}

      <form className={styles.composer__form} onSubmit={handleSubmit}>
        <textarea
          ref={ref}
          className={styles.composer__input}
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
        />
        <div className={styles.composer__buttons}>
          {sketchEnabled && (
            <button
              type="button"
              className={`${styles["composer__sketch-button"]} ${sketchOpen ? styles["composer__sketch-button--active"] : ""}`}
              onClick={() => setSketchOpen((prev) => !prev)}
              disabled={capturedSketchId !== undefined}
              aria-label={COPY.composer.sketchToggleAriaLabel}
              title={COPY.composer.sketchToggleAriaLabel}
            >
              ✎
            </button>
          )}
          {isStreaming ? (
            <button
              type="button"
              className={`${styles.composer__send} ${styles["composer__send--stop"]}`}
              aria-label={COPY.composer.stopAriaLabel}
              onClick={onCancel}
            >
              ■
            </button>
          ) : (
            <button
              type="submit"
              className={styles.composer__send}
              aria-label={COPY.composer.sendAriaLabel}
              disabled={!value.trim()}
            >
              Send ↵
            </button>
          )}
        </div>
      </form>
      <div className={styles.composer__hints}>{COPY.composer.hints}</div>
    </div>
  );
});
