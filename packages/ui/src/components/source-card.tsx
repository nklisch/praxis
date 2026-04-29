import type { RetrievalCitation } from "@praxis/core/types";
import styles from "./source-card.module.css";

export interface SourceCardProps {
  citation: RetrievalCitation;
  onViewPage?: ((documentId: string, page: number) => void) | undefined;
}

/**
 * Source card rendered below an assistant message. Shows chunk text, document
 * title, section, and page. When hasPageImage is true, shows a "View page" button.
 */
export function SourceCard({ citation, onViewPage }: SourceCardProps) {
  return (
    <div className={styles.card} id={`citation-${citation.index}`}>
      <div className={styles.header}>
        <span className={styles.index}>[{citation.index}]</span>
        <span className={styles.title}>{citation.documentTitle}</span>
        {citation.section && <span className={styles.section}>{citation.section}</span>}
        {citation.page !== undefined && <span className={styles.page}>p.{citation.page}</span>}
      </div>
      <p className={styles.text}>{citation.chunkText}</p>
      {citation.hasPageImage && citation.page !== undefined && onViewPage && (
        <button
          type="button"
          className={styles.viewPageBtn}
          onClick={() => onViewPage(citation.documentId, citation.page!)}
        >
          View page {citation.page}
        </button>
      )}
    </div>
  );
}
