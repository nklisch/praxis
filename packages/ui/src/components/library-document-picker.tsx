import type { DocumentId, DocumentScope } from "@praxis/core/types";
import { useCallback, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { useResource } from "../hooks/use-resource.js";
import { COPY } from "../lib/copy.js";
import { BatchSummaryModal } from "./batch-summary-modal.js";
import { EmptyState } from "./empty-state.js";
import { ErrorMessage } from "./error-message.js";
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
  onAttached?: (documentId: DocumentId) => void;
}

/**
 * Modal picker that lists the student's full document library, marking which
 * docs are already attached to the given scope. Clicking "Attach" calls
 * client.documentScopes.attach and optimistically updates the attached set.
 *
 * Accepts any DocumentScope (course or session) — pass `scope` instead of
 * the old `courseId` prop.
 */
export function LibraryDocumentPicker({ scope, onClose, onAttached }: LibraryDocumentPickerProps) {
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

  // Ingestion hook — scoped to the picker's scope so dropped/uploaded files
  // are auto-attached to the same scope. onDone refreshes the picker list.
  const ingestion = useIngestion(
    useCallback(async () => {
      await refresh();
    }, [refresh]),
    { scope },
  );

  // Per-row loading state: maps documentId → true while attach is in-flight.
  const [attaching, setAttaching] = useState<Record<string, boolean>>({});
  // Per-row error state: maps documentId → error message.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

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

  const handleAttach = useCallback(
    async (documentId: DocumentId) => {
      setAttaching((prev) => ({ ...prev, [documentId]: true }));
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[documentId];
        return next;
      });
      try {
        await client.documentScopes.attach({
          scope,
          documentId,
          source: "manual",
        });
        // Optimistically add to attached set.
        setData((prev) => {
          if (!prev) return { library: [], attachedIds: new Set([documentId]) };
          const next = new Set(prev.attachedIds);
          next.add(documentId);
          return { ...prev, attachedIds: next };
        });
        onAttached?.(documentId);
      } catch (err) {
        setRowErrors((prev) => ({
          ...prev,
          [documentId]: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        setAttaching((prev) => {
          const next = { ...prev };
          delete next[documentId];
          return next;
        });
      }
    },
    [client, scope, setData, onAttached],
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
                  const isAttaching = attaching[doc.documentId] === true;
                  const rowError = rowErrors[doc.documentId];

                  return (
                    <li key={doc.documentId} className={styles.row}>
                      <div className={styles.rowInfo}>
                        <span className={styles.filename}>{doc.filename}</span>
                        <span className={styles.meta}>
                          {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""}
                        </span>
                        {rowError && <span className={styles.rowError}>{rowError}</span>}
                      </div>
                      {isAttached ? (
                        <span className={styles.attachedBadge}>attached</span>
                      ) : (
                        <button
                          type="button"
                          className={styles.attachBtn}
                          onClick={() => void handleAttach(doc.documentId as DocumentId)}
                          disabled={isAttaching}
                        >
                          {isAttaching ? "attaching…" : "Attach"}
                        </button>
                      )}
                    </li>
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
