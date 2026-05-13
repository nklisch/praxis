import type { UseIngestionResult } from "../hooks/use-ingestion.js";
import styles from "./add-document-button.module.css";
import { BatchSummaryModal } from "./batch-summary-modal.js";
import { PickerTierModal } from "./picker-tier-modal.js";

export interface AddFolderButtonProps {
  ingestion: UseIngestionResult;
}

/**
 * Button that opens a folder picker, recursively walks the selected folder for
 * supported files, and ingests them sequentially via the batch flow.
 *
 * Reuses the same CSS class as AddDocumentButton (add-document-button.module.css)
 * so both buttons have a consistent dashed appearance in the document library.
 */
export function AddFolderButton({ ingestion }: AddFolderButtonProps) {
  const { state, startPickBatch, confirmTier, skipCurrentFile, dismiss, cancelBatch } = ingestion;

  const isActive =
    state.status === "picking" || state.status === "tier_selection" || state.status === "ingesting";

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => startPickBatch("folder")}
        disabled={isActive}
        title="Add a folder of documents"
      >
        + Add folder
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
