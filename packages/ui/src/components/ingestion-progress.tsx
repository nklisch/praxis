import type { IngestionState } from "../hooks/use-ingestion.js";
import styles from "./ingestion-progress.module.css";

export interface IngestionProgressProps {
  state: IngestionState;
  onDismiss: () => void;
}

function stateLabel(state: IngestionState): string {
  switch (state.status) {
    case "idle":
    case "picking":
      return "Preparing…";
    case "tier_selection":
      return "Select ingestion method";
    case "ingesting": {
      const lastEvent = state.events[state.events.length - 1];
      if (!lastEvent) return `Ingesting ${state.filename}…`;
      if (lastEvent.type === "parsing") return lastEvent.message;
      if (lastEvent.type === "ingestor_selected") return `Using ${lastEvent.ingestorLabel}…`;
      if (lastEvent.type === "parsed") return `Parsed ${lastEvent.chunkCount} chunks. Indexing…`;
      if (lastEvent.type === "indexing")
        return `Indexing… ${lastEvent.chunksProcessed} / ${lastEvent.totalChunks}`;
      if (lastEvent.type === "vision_page")
        return `Vision OCR page ${lastEvent.page} / ${lastEvent.totalPages}…`;
      return `Ingesting ${state.filename}…`;
    }
    case "done":
      return `Done. ${state.chunkCount} chunks indexed.`;
    case "error":
      return `Error: ${state.message}`;
    default:
      return "";
  }
}

/**
 * Modal overlay showing ingestion progress. Visible during ingesting/done/error states.
 */
export function IngestionProgress({ state, onDismiss }: IngestionProgressProps) {
  const visible =
    state.status === "ingesting" || state.status === "done" || state.status === "error";
  if (!visible) return null;

  const isDone = state.status === "done" || state.status === "error";
  const isError = state.status === "error";

  const progress =
    state.status === "ingesting" && state.totalChunks > 0
      ? state.chunksProcessed / state.totalChunks
      : null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <p className={`${styles.label} ${isError ? styles.errorLabel : ""}`}>{stateLabel(state)}</p>
        {progress !== null && (
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {isDone && (
          <button type="button" className={styles.dismissBtn} onClick={onDismiss}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
