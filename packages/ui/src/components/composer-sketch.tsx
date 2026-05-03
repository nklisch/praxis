/**
 * Phase 15a: ComposerSketch — inline sketch capture panel.
 *
 * Renders inside the composer area above the textarea when the user activates
 * the "✎ Sketch" affordance. Provides a <SketchCanvas variant="inline" />
 * plus Cancel / Submit-sketch buttons.
 *
 * On submit: captures the canvas → uploads via client.sketches.put →
 * calls onCaptured(sketchId). The caller (Composer) then appends the
 * [sketch:<id>] marker to the outgoing message.
 *
 * On cancel: calls onCancel without uploading anything.
 */
import type { SketchId } from "@praxis/core/types";
import { useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { COPY } from "../lib/copy.js";
import type { SketchCanvasHandle } from "./sketch-canvas.js";
import { SketchCanvas } from "./sketch-canvas.js";
import styles from "./composer-sketch.module.css";

export interface ComposerSketchProps {
  /** Called with the captured SketchId after successful upload. */
  onCaptured: (sketchId: SketchId) => void;
  /** Called when the user collapses the panel without capturing. */
  onCancel: () => void;
}

export function ComposerSketch({ onCaptured, onCancel }: ComposerSketchProps) {
  const client = usePraxisClient();
  const sketchHandleRef = useRef<SketchCanvasHandle>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const handle = sketchHandleRef.current;
    if (!handle) return;

    setUploading(true);
    setError(null);
    try {
      const captured = await handle.capture();
      const summary = await client.sketches.put({
        snapshot: captured.snapshot,
        image: captured.image,
        width: captured.width,
        height: captured.height,
      });
      onCaptured(summary.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.panel}>
      <SketchCanvas variant="inline" handleRef={sketchHandleRef} />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onCancel}
          disabled={uploading}
        >
          {COPY.composer.sketchCancelButton}
        </button>
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : COPY.composer.sketchSubmitButton}
        </button>
      </div>
    </div>
  );
}
