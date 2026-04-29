/**
 * Citation types for Phase 5 hybrid retrieval. Scores are RRF-fused ranks —
 * higher = more relevant. Results are pre-sorted; the score is informational.
 *
 * Note: `RetrievalCitation` is distinct from `Citation` in `common.ts` (which is a
 * simple source reference). `RetrievalCitation` is the rich citation produced by
 * Phase 5's hybrid RAG pipeline.
 */

export interface RetrievalCitation {
  index: number;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** When set, the UI shows a "📄 View page" button that fetches the page image. */
  hasPageImage?: boolean;
  /** Combined retrieval score (RRF-fused). Informational; results pre-sorted. */
  score: number;
}

export interface RetrievalResult {
  query: string;
  citations: RetrievalCitation[];
}
