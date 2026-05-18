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

// ─── Document citations (client-side) ────────────────────────────────────────

import type { DocumentId, SessionId } from "./ids.js";

/**
 * A single document citation record — a passage range within a document that
 * was referenced by the tutor in a teach session.
 */
export interface DocumentCitationRecord {
  id: string;
  documentId: DocumentId;
  citingSessionId: SessionId;
  citingTurnId: string | null;
  startOffset: number;
  endOffset: number;
  /** Captured snippet; may be null when the text was not stored at record time. */
  citedText: string | null;
  createdAt: number; // epoch ms
}

/**
 * Client-side citations API.
 * - `record`: called by the tutor tool pipeline when citing a passage.
 * - `listByDocument`: called by `<DocumentTabBody>` on mount to fetch highlights.
 */
export interface CitationsClientApi {
  record(input: {
    documentId: DocumentId;
    citingSessionId: SessionId;
    citingTurnId?: string;
    startOffset: number;
    endOffset: number;
    citedText?: string;
  }): Promise<DocumentCitationRecord>;

  listByDocument(documentId: DocumentId): Promise<DocumentCitationRecord[]>;
}
