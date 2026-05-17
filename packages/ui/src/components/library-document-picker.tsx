import type { DocumentId, DocumentScope } from "@praxis/core/types";
import { useCallback, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import { COPY } from "../lib/copy.js";
import { EmptyState } from "./empty-state.js";
import { ErrorMessage } from "./error-message.js";
import styles from "./library-document-picker.module.css";
import { LoadingState } from "./loading-state.js";
import { Modal } from "./modal.js";

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

  const { data, loading, error, setData } = useResource(loader);

  // Per-row loading state: maps documentId → true while attach is in-flight.
  const [attaching, setAttaching] = useState<Record<string, boolean>>({});
  // Per-row error state: maps documentId → error message.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

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

  return (
    <Modal onClose={onClose} ariaLabel="Attach document from library" maxWidth="520px">
      <span className={styles.ornament}>⁂</span>
      <span className={styles.kicker}>LIBRARY</span>
      <h2 className={styles.title}>attach from library</h2>
      <p className={styles.deck}>{deckCopy}</p>

      {loading && <LoadingState message={COPY.loading.documents} />}

      {error && <ErrorMessage error={error} />}

      {!loading && !error && data && data.library.length === 0 && (
        <EmptyState message={COPY.empty.libraryPickerEmpty} compact />
      )}

      {!loading && !error && data && data.library.length > 0 && (
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
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
