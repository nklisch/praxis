import type { DocumentSummary } from "@praxis/core/types";
import styles from "./document-list.module.css";

export interface DocumentListProps {
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  onDelete: (documentId: string) => void;
}

/** Sidebar list of ingested documents with delete buttons. */
export function DocumentList({ documents, loading, error, onDelete }: DocumentListProps) {
  if (loading) {
    return <p className={styles.status}>Loading documents…</p>;
  }
  if (error) {
    return <p className={styles.error}>{error}</p>;
  }
  if (documents.length === 0) {
    return <p className={styles.empty}>No documents yet. Add a file to search your textbooks.</p>;
  }

  return (
    <ul className={styles.list}>
      {documents.map((doc) => (
        <li key={doc.documentId} className={styles.item}>
          <div className={styles.info}>
            <span className={styles.filename}>{doc.filename}</span>
            <span className={styles.badge}>{doc.ingestorLabel}</span>
            <span className={styles.meta}>{doc.chunkCount} chunks</span>
          </div>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => onDelete(doc.documentId)}
            title="Remove document"
            aria-label={`Remove ${doc.filename}`}
          >
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
}
