import { useState } from "react";
import { Modal } from "./modal.js";
import styles from "./picker-tier-modal.module.css";

export interface PickerTierModalProps {
  filename: string;
  filePath: string;
  mimeType: string;
  onConfirm: (
    filePath: string,
    filename: string,
    mimeType: string,
    preferIngestorId?: string,
  ) => void;
  onCancel: () => void;
  /**
   * When set, the modal is in batch mode.
   * Renders "File N of M" context above the options and a "Skip this file"
   * button that advances the batch without ingesting the current file.
   */
  batch?: { current: number; total: number };
  /**
   * Called when the user clicks "Skip this file" in batch mode.
   * Resolves the tier deferred with a skip outcome so the batch loop advances.
   * Required when `batch` is provided; ignored otherwise.
   */
  onSkip?: () => void;
}

/**
 * Modal shown when the user picks a PDF file.
 * Asks whether to use vision parsing (better for math + scans) or JS text-layer parsing.
 * Default: JS tier (no checkbox checked).
 *
 * In batch mode (`batch` prop set), also shows "File N of M" context and a
 * "Skip this file" button.
 */
export function PickerTierModal({
  filename,
  filePath,
  mimeType,
  onConfirm,
  onCancel,
  batch,
  onSkip,
}: PickerTierModalProps) {
  const [useVision, setUseVision] = useState(false);

  const handleConfirm = () => {
    const preferIngestorId = useVision ? "vision-pdf" : "js-pdf";
    onConfirm(filePath, filename, mimeType, preferIngestorId);
  };

  return (
    <Modal onClose={onCancel} ariaLabel="PDF options" maxWidth="380px">
      {batch !== undefined && (
        <p className={styles.batchPosition}>
          File {batch.current} of {batch.total}
        </p>
      )}
      <h2 className={styles.title}>PDF options</h2>
      <p className={styles.filename}>{filename}</p>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={useVision}
          onChange={(e) => setUseVision(e.target.checked)}
        />
        <span>
          Use vision parsing
          <small className={styles.hint}>
            Better for math, diagrams, and scanned PDFs. Uses your engine&apos;s vision capability.
            Slower.
          </small>
        </span>
      </label>
      <div className={styles.actions}>
        {batch !== undefined && onSkip !== undefined && (
          <button type="button" className={styles.skipBtn} onClick={onSkip}>
            Skip this file
          </button>
        )}
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.confirmBtn} onClick={handleConfirm}>
          Import
        </button>
      </div>
    </Modal>
  );
}
