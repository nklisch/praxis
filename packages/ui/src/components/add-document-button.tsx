import type { UseIngestionResult } from "../hooks/use-ingestion.js";
import styles from "./add-document-button.module.css";
import { BatchSummaryModal } from "./batch-summary-modal.js";
import { PickerTierModal } from "./picker-tier-modal.js";

export interface AddDocumentButtonProps {
  ingestion: UseIngestionResult;
}

/**
 * Button that opens a multi-file picker and drives the batch ingestion flow.
 * Renders the tier modal (for PDFs) and batch summary modal as overlays.
 */
export function AddDocumentButton({ ingestion }: AddDocumentButtonProps) {
  const { state, startPickBatch, confirmTier, skipCurrentFile, dismiss, cancelBatch } = ingestion;

  const isActive =
    state.status === "picking" || state.status === "tier_selection" || state.status === "ingesting";

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => startPickBatch("files")}
        disabled={isActive}
        title="Add documents"
      >
        + Add documents
      </button>

      {state.status === "tier_selection" && (
        <PickerTierModal
          filename={state.filename}
          filePath={state.filePath}
          mimeType={state.mimeType}
          onConfirm={confirmTier}
          onCancel={cancelBatch}
          {...(state.batch !== undefined && { batch: state.batch })}
          {...(state.batch !== undefined && { onSkip: skipCurrentFile })}
        />
      )}

      {state.status === "batch_summary" && (
        <BatchSummaryModal results={state.results} onDone={dismiss} />
      )}
    </>
  );
}
