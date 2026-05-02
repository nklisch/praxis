import type { DocumentSummary } from "@praxis/core/types";
import { COPY } from "../../lib/copy.js";
import { AddDocumentButton } from "../add-document-button.js";
import styles from "./documents-section.module.css";

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
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <span className={styles.ornament} aria-hidden="true">
          ‡
        </span>
        <span className={styles.kicker}>DOCUMENTS</span>
        {ingestion && (
          <span className={styles.addAction}>
            <AddDocumentButton ingestion={ingestion} />
          </span>
        )}
      </header>

      {loading && <p className={styles.status}>{COPY.loading.documents}</p>}

      {!loading && (!documents || documents.length === 0) && (
        <p className={styles.empty}>{COPY.empty.libraryDocumentsEmpty}</p>
      )}

      {!loading && documents && documents.length > 0 && (
        <ol className={styles.list}>
          {documents.map((doc) => (
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
    </section>
  );
}
