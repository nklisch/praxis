import type { BatchResult } from "../hooks/use-ingestion.js";
import styles from "./batch-summary-modal.module.css";
import { Modal } from "./modal.js";

export interface BatchSummaryModalProps {
  results: BatchResult[];
  onDone: () => void;
}

/**
 * Modal shown after a batch ingestion completes (or is cancelled).
 * Displays a count of successes and failures, lists each file's outcome,
 * and provides a "Done" button that returns the hook to idle.
 */
export function BatchSummaryModal({ results, onDone }: BatchSummaryModalProps) {
  const succeeded = results.filter((r) => r.outcome.ok);
  const failed = results.filter((r) => !r.outcome.ok);

  const headline =
    results.length === 0
      ? "No files processed"
      : succeeded.length === results.length
        ? `${succeeded.length} file${succeeded.length !== 1 ? "s" : ""} added`
        : `${succeeded.length} of ${results.length} file${results.length !== 1 ? "s" : ""} added`;

  return (
    <Modal onClose={onDone} ariaLabel="Ingestion summary" maxWidth="480px">
      <h2 className={styles.title}>Import complete</h2>
      <p className={styles.headline}>{headline}</p>

      {results.length > 0 && (
        <ul className={styles.list}>
          {results.map((r) => (
            <li key={r.filePath} className={r.outcome.ok ? styles.itemOk : styles.itemFail}>
              <span className={styles.filename}>{r.filename}</span>
              {r.outcome.ok ? (
                <span className={styles.detail}>
                  {r.outcome.chunkCount} chunk{r.outcome.chunkCount !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className={styles.detail}>{r.outcome.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {failed.length > 0 && (
        <p className={styles.failNote}>
          {failed.length} file{failed.length !== 1 ? "s" : ""} could not be imported. Check that the
          files are not password-protected or corrupted.
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.doneBtn} onClick={onDone}>
          Done
        </button>
      </div>
    </Modal>
  );
}
