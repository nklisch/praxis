import type { DocumentSummary } from "@praxis/core/types";
import { COPY } from "../../lib/copy.js";
import { AddDocumentButton } from "../add-document-button.js";
import { AddFolderButton } from "../add-folder-button.js";
import styles from "./documents-section.module.css";
import { LibrarySection } from "./library-section.js";

export interface DocumentsSectionProps {
  documents: ReadonlyArray<DocumentSummary> | undefined;
  loading: boolean;
  /**
   * Ingestion state — passed to AddDocumentButton so the Library can trigger
   * the same ingestion flow as the chat sidebar.
   */
  // biome-ignore lint/suspicious/noExplicitAny: useIngestion return type; keeps dep direction clean
  ingestion?: any;
}

/**
 * Editorial listing of ingested documents.
 * Shows filename + chunk count + "Add document" affordance.
 * The AddDocumentButton handles file picking and ingestion progress.
 */
export function DocumentsSection({ documents, loading, ingestion }: DocumentsSectionProps) {
  return (
    <LibrarySection<DocumentSummary>
      ornament="‡"
      kicker="DOCUMENTS"
      headerAction={
        ingestion ? (
          <div className={styles.headerButtons}>
            <AddDocumentButton ingestion={ingestion} />
            <AddFolderButton ingestion={ingestion} />
          </div>
        ) : undefined
      }
      loading={loading}
      items={documents}
      emptyMessage={COPY.empty.libraryDocumentsEmpty}
      renderItems={(items) => (
        <ol className={styles.list}>
          {items.map((doc) => (
            <li key={doc.documentId} className={styles.item}>
              <div className={styles.itemBody}>
                <span className={styles.itemTitle}>{doc.filename}</span>
                <span className={styles.itemDeck}>
                  {doc.ingestorLabel} · {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""}
                  {doc.hasPageImages ? " · pages" : ""}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    />
  );
}
