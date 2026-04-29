import type { UseIngestionResult } from "../hooks/use-ingestion.js";
import styles from "./add-document-button.module.css";
import { IngestionProgress } from "./ingestion-progress.js";
import { PickerTierModal } from "./picker-tier-modal.js";

export interface AddDocumentButtonProps {
  ingestion: UseIngestionResult;
}

/**
 * Button that opens the file picker and drives the ingestion flow.
 * Renders the tier modal (for PDFs) and progress modal as overlays.
 */
export function AddDocumentButton({ ingestion }: AddDocumentButtonProps) {
  const { state, startPick, confirmTier, dismiss } = ingestion;

  const isActive =
    state.status === "picking" || state.status === "tier_selection" || state.status === "ingesting";

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={startPick}
        disabled={isActive}
        title="Add document"
      >
        + Add document
      </button>

      {state.status === "tier_selection" && (
        <PickerTierModal
          filename={state.filename}
          filePath={state.filePath}
          mimeType={state.mimeType}
          onConfirm={confirmTier}
          onCancel={dismiss}
        />
      )}

      <IngestionProgress state={state} onDismiss={dismiss} />
    </>
  );
}
