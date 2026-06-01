import type { DocumentId, DocumentScope } from "@praxis/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useActionEscalation } from "../hooks/use-action-escalation.js";
import type { UseIngestionResult } from "../hooks/use-ingestion.js";
import { useOptimisticAction } from "../hooks/use-optimistic-action.js";
import { useResource } from "../hooks/use-resource.js";
import { COPY } from "../lib/copy.js";
import { ActionPip } from "./action-pip.js";
import { BatchSummaryModal } from "./batch-summary-modal.js";
import { EmptyState } from "./empty-state.js";
import { ErrorMessage } from "./error-message.js";
import { FailurePopover } from "./failure-popover.js";
import styles from "./library-document-picker.module.css";
import { LoadingState } from "./loading-state.js";
import { Modal } from "./modal.js";
import { PickerTierModal } from "./picker-tier-modal.js";

export interface LibraryDocumentPickerProps {
  /** Polymorphic scope: attach to a course (`{ kind: 'course', id }`) or a
   *  session (`{ kind: 'session', id }`). The picker adapts its heading copy. */
  scope: DocumentScope;
  onClose: () => void;
  /** Called after any document is successfully attached. */
  onAttached?: ((documentId: DocumentId) => void) | undefined;
  /**
   * Ingestion state machine hoisted from the parent so that closing the picker
   * does not abort an in-flight batch. The parent must call `useIngestion` and
   * pass the result here — this keeps ingestion alive across picker mount cycles.
   */
  ingestion: UseIngestionResult;
}

// ── Per-row document attachment ───────────────────────────────────────────────

interface DocumentPickerRowProps {
  doc: { documentId: string; filename: string; chunkCount: number };
  scope: DocumentScope;
  isAlreadyAttached: boolean;
  onAttached?: ((documentId: DocumentId) => void) | undefined;
  onOptimisticAttach: (documentId: DocumentId) => void;
  onOptimisticRevert: (documentId: DocumentId) => void;
}

/**
 * Per-row component so each row gets its own `useOptimisticAction` instance.
 * This ensures independent pip state per row — concurrent attaches don't
 * cross-talk.
 */
function DocumentPickerRow({
  doc,
  scope,
  isAlreadyAttached,
  onAttached,
  onOptimisticAttach,
  onOptimisticRevert,
}: DocumentPickerRowProps): React.ReactElement {
  const client = usePraxisClient();
  const documentId = doc.documentId as DocumentId;

  // Track when this row's attach action failed for escalation.
  const [failedAt, setFailedAt] = useState<number | null>(null);

  const attachAction = useOptimisticAction<void>({
    dispatch: async () => {
      await client.documentScopes.attach({
        scope,
        documentId,
        source: "manual",
      });
      onAttached?.(documentId);
    },
    onError: () => {
      // Revert the optimistic attached state on failure.
      onOptimisticRevert(documentId);
      setFailedAt(Date.now());
    },
  });

  const handleAttach = () => {
    // Optimistically mark as attached immediately before the IPC call resolves.
    onOptimisticAttach(documentId);
    attachAction.trigger();
  };

  // Escalate unattended failures to the activity strip after threshold.
  useActionEscalation({
    failedActions:
      attachAction.state === "failed" && failedAt !== null
        ? [{ id: `attach-${documentId}`, label: `Attach "${doc.filename}" failed`, failedAt }]
        : [],
    activity: null,
  });

  return (
    <li key={doc.documentId} className={styles.row}>
      <div className={styles.rowInfo}>
        <span className={styles.filename}>{doc.filename}</span>
        <span className={styles.meta}>
          {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""}
        </span>
      </div>
      {isAlreadyAttached ? (
        <span className={styles.attachedBadge}>attached</span>
      ) : (
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          <button
            type="button"
            className={styles.attachBtn}
            onClick={handleAttach}
            disabled={attachAction.state === "pending" || attachAction.state === "retrying"}
          >
            Attach
          </button>
          <ActionPip state={attachAction.state} />
          {attachAction.state === "failed" && (
            <FailurePopover
              reason={attachAction.errorReason}
              actions={[
                {
                  label: COPY.actionPip.retryLabel,
                  onClick: attachAction.retry,
                  variant: "primary",
                },
                { label: COPY.actionPip.dismissLabel, onClick: attachAction.dismiss },
              ]}
            />
          )}
        </div>
      )}
    </li>
  );
}

// ── Main picker component ─────────────────────────────────────────────────────

/**
 * Modal picker that lists the student's full document library, marking which
 * docs are already attached to the given scope. Clicking "Attach" calls
 * client.documentScopes.attach and optimistically updates the attached set.
 *
 * Accepts any DocumentScope (course or session) — pass `scope` instead of
 * the old `courseId` prop.
 */
export function LibraryDocumentPicker({
  scope,
  onClose,
  onAttached,
  ingestion,
}: LibraryDocumentPickerProps) {
  const client = usePraxisClient();

  // Load the full library and the currently-attached set in parallel.
  const loader = useCallback(async () => {
    const [library, attached] = await Promise.all([
      client.documents.list(),
      client.documentScopes.listForScope(scope),
    ]);
    const attachedIds = new Set(attached.map((d) => d.documentId));
    return { library, attachedIds };
  }, [client, scope]);

  const { data, loading, error, setData, refresh } = useResource(loader);

  // Refresh the picker's document list whenever the hoisted ingestion completes
  // a batch or a single file. We track the previous status to detect transitions
  // into terminal states rather than re-running on every status string equality.
  const prevIngestionStatusRef = useRef(ingestion.state.status);
  useEffect(() => {
    const prev = prevIngestionStatusRef.current;
    const curr = ingestion.state.status;
    prevIngestionStatusRef.current = curr;
    // A transition into batch_summary or done means at least one file was processed.
    if ((curr === "batch_summary" || curr === "done") && prev !== curr) {
      void refresh();
    }
  }, [ingestion.state.status, refresh]);

  // Drag-and-drop overlay state.
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    // Guard against false leaves on child elements.
    if (e.currentTarget === e.target) setIsDraggingOver(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    // Electron extends File with a non-standard .path property.
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (paths.length > 0) {
      await ingestion.startBatchWithPaths(paths);
    }
  }

  async function handleUploadClick() {
    await ingestion.startPickBatch("files");
  }

  // Optimistic attach: add the id to the attached set immediately.
  const handleOptimisticAttach = useCallback(
    (documentId: DocumentId) => {
      setData((prev) => {
        if (!prev) return { library: [], attachedIds: new Set([documentId]) };
        const next = new Set(prev.attachedIds);
        next.add(documentId);
        return { ...prev, attachedIds: next };
      });
    },
    [setData],
  );

  // Optimistic revert: remove the id from the attached set on failure.
  const handleOptimisticRevert = useCallback(
    (documentId: DocumentId) => {
      setData((prev) => {
        if (!prev) return { library: [], attachedIds: new Set() };
        const next = new Set(prev.attachedIds);
        next.delete(documentId);
        return { ...prev, attachedIds: next };
      });
    },
    [setData],
  );

  const isSession = scope.kind === "session";
  const deckCopy = isSession ? COPY.libraryPicker.deckSession : COPY.libraryPicker.deckCourse;

  const isIngestionActive =
    ingestion.state.status === "picking" ||
    ingestion.state.status === "tier_selection" ||
    ingestion.state.status === "ingesting";

  return (
    <>
      {/* Hide the picker while the batch-summary modal is showing so both modals
          don't stack simultaneously (Bug 1 fix). The LibraryDocumentPicker
          component stays mounted — only its <Modal> is conditionally rendered. */}
      {ingestion.state.status !== "batch_summary" && (
        <Modal onClose={onClose} ariaLabel="Attach document from library" maxWidth="520px">
          <div className={styles.pickerHeader}>
            <div>
              <span className={styles.ornament}>⁂</span>
              <span className={styles.kicker}>LIBRARY</span>
              <h2 className={styles.title}>attach from library</h2>
              <p className={styles.deck}>{deckCopy}</p>
            </div>
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={() => void handleUploadClick()}
              disabled={isIngestionActive}
              title="Upload files"
            >
              + Upload
            </button>
          </div>

          {loading && <LoadingState message={COPY.loading.documents} />}

          {error && <ErrorMessage error={error} />}

          {!loading && !error && data && data.library.length === 0 && (
            <EmptyState message={COPY.empty.libraryPickerEmpty} compact />
          )}

          {!loading && !error && data && data.library.length > 0 && (
            // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop progressive enhancement; keyboard upload is provided by the "+ Upload" button above
            <div
              className={styles.listArea}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e)}
            >
              <ul className={styles.list}>
                {data.library.map((doc) => {
                  const isAttached = data.attachedIds.has(doc.documentId as DocumentId);

                  return (
                    <DocumentPickerRow
                      key={doc.documentId}
                      doc={doc}
                      scope={scope}
                      isAlreadyAttached={isAttached}
                      onAttached={onAttached}
                      onOptimisticAttach={handleOptimisticAttach}
                      onOptimisticRevert={handleOptimisticRevert}
                    />
                  );
                })}
              </ul>
              {isDraggingOver && (
                <div className={styles.dropOverlay} role="presentation">
                  <p>Drop files to upload</p>
                </div>
              )}
            </div>
          )}

          {/* Show drag hint when library is empty too */}
          {!loading && !error && data && data.library.length === 0 && (
            // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop progressive enhancement; keyboard upload is provided by the "+ Upload" button above
            <div
              className={styles.emptyDropZone}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e)}
            >
              {isDraggingOver && (
                <div className={styles.dropOverlay} role="presentation">
                  <p>Drop files to upload</p>
                </div>
              )}
            </div>
          )}

          <div className={styles.footer}>
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {ingestion.state.status === "tier_selection" && (
        <PickerTierModal
          filename={ingestion.state.filename}
          filePath={ingestion.state.filePath}
          mimeType={ingestion.state.mimeType}
          onConfirm={ingestion.confirmTier}
          onCancel={ingestion.cancelBatch}
          {...(ingestion.state.batch !== undefined && { batch: ingestion.state.batch })}
          {...(ingestion.state.batch !== undefined && { onSkip: ingestion.skipCurrentFile })}
        />
      )}

      {ingestion.state.status === "batch_summary" && (
        <BatchSummaryModal results={ingestion.state.results} onDone={ingestion.dismiss} />
      )}
    </>
  );
}
