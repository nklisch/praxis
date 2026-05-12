import type { JSX } from "react";
import { useDeferredValue, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./prompt-preview-pane.module.css";

const PREVIEW_MODES = [
  "teach",
  "quiz",
  "homework",
  "exam",
  "configure",
  "bootstrap",
  "study-skills",
] as const;

export interface PromptPreviewPaneProps {
  /** Mode to preview against. */
  modeId: string;
  /** When provided, overrides the stored global fragment for the preview. */
  draftGlobal?: string | null;
  /** When provided, overrides the stored mode append for the preview. */
  draftAppend?: string | null;
  /** Render the built-in mode-selector dropdown. */
  showModeSelector?: boolean;
  /** Called when the user picks a different mode via the built-in selector. */
  onModeChange?: (modeId: string) => void;
}

/**
 * Live preview pane — shows the fully composed system prompt for a given mode.
 *
 * Owns the debounce (via useDeferredValue), the IPC call, and the <pre>
 * rendering. Consumers pass draft inputs and an onModeChange if they want
 * the mode picker.
 */
export function PromptPreviewPane({
  modeId,
  draftGlobal,
  draftAppend,
  showModeSelector = false,
  onModeChange,
}: PromptPreviewPaneProps): JSX.Element {
  const client = usePraxisClient();

  // Defer both draft inputs so the preview only recomputes once the user pauses.
  const deferredGlobal = useDeferredValue(draftGlobal);
  const deferredAppend = useDeferredValue(draftAppend);

  const [preview, setPreview] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    void (async () => {
      try {
        const composed = await client.author.previewPrompt({
          modeId,
          ...(deferredGlobal !== undefined && { draftGlobal: deferredGlobal }),
          ...(deferredAppend !== undefined && { draftAppend: deferredAppend }),
        });
        if (!cancelled) setPreview(composed);
      } catch {
        // Keep prior preview on transient errors — silent degradation.
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, modeId, deferredGlobal, deferredAppend]);

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        {showModeSelector ? (
          <label htmlFor="prompt-preview-mode-select" className={styles.label}>
            preview against
            <select
              id="prompt-preview-mode-select"
              className={styles.modeSelect}
              value={modeId}
              onChange={(e) => onModeChange?.(e.target.value)}
            >
              {PREVIEW_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className={styles.label}>
            preview — <span className={styles.modeName}>{modeId}</span>
          </span>
        )}

        {previewLoading && (
          <span className={styles.refreshing} aria-label="Refreshing preview">
            …
          </span>
        )}
      </div>

      <pre className={styles.preview}>{preview}</pre>
    </div>
  );
}
