// ─── RAG infrastructure service ports ────────────────────────────────────────
// EmbeddingService, VectorStore, FtsStore, DocumentsReader

// ─── EmbeddingService ────────────────────────────────────────────────────────

export interface EmbeddingService {
  /** Encode a passage / chunk for storage. */
  embed(text: string): Promise<number[]>;
  /** Encode a question/query for retrieval. Uses model-specific prefix when applicable. */
  embedQuery(query: string): Promise<number[]>;
  /** Batch passage encoding. */
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimension: number;
  readonly modelId: string;
}

// ─── VectorStore ─────────────────────────────────────────────────────────────

export interface VectorStore {
  upsert(input: VectorUpsertInput): Promise<void>;
  upsertBatch(items: ReadonlyArray<VectorUpsertInput>): Promise<void>;
  search(input: VectorSearchInput): Promise<VectorSearchResult[]>;
  deleteByDocumentId(documentId: string): Promise<void>;
}

export interface VectorUpsertInput {
  chunkId: string;
  documentId: string;
  embedding: number[];
  chunkText: string;
  page?: number;
  section?: string;
}

export interface VectorSearchInput {
  embedding: number[];
  topK: number;
  documentIds?: ReadonlyArray<string>;
  /** Section name substring filter (case-insensitive). */
  sectionPattern?: string;
  /** Page range filter (inclusive). */
  pageRange?: { from: number; to: number };
}

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  chunkText: string;
  page?: number;
  section?: string;
  distance: number;
}

// ─── FtsStore ────────────────────────────────────────────────────────────────

export interface FtsStore {
  upsert(input: FtsUpsertInput): Promise<void>;
  upsertBatch(items: ReadonlyArray<FtsUpsertInput>): Promise<void>;
  /** BM25 full-text search. Returns chunks ranked by FTS5's BM25 score. */
  search(input: FtsSearchInput): Promise<FtsSearchResult[]>;
  deleteByDocumentId(documentId: string): Promise<void>;
}

export interface FtsUpsertInput {
  chunkId: string;
  documentId: string;
  chunkText: string;
  section?: string;
  page?: number;
}

export interface FtsSearchInput {
  /** Plain text query. The store internally builds an FTS5 MATCH expression. */
  query: string;
  topK: number;
  documentIds?: ReadonlyArray<string>;
  sectionPattern?: string;
  pageRange?: { from: number; to: number };
}

export interface FtsSearchResult {
  chunkId: string;
  documentId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** BM25 rank score from FTS5 (lower = more relevant; FTS5 returns negative log-prob). */
  score: number;
}

// ─── DocumentsReader ─────────────────────────────────────────────────────────

/** A single document chunk as returned by the reader. */
export interface DocumentChunkRow {
  chunkIndex: number;
  text: string;
  page?: number;
  section?: string;
}

export interface DocumentsReader {
  titlesByIds(ids: ReadonlyArray<string>): Promise<Map<string, string>>;
  /** Fetch the page image bytes if one was saved during vision-tier ingestion. */
  pageImage(input: { documentId: string; page: number }): Promise<Buffer | null>;
  /**
   * Phase 16: Return all chunks for a document, filtered by studentId for
   * ownership verification. Ordered by chunkIndex.
   */
  chunksForDocument(input: { documentId: string; studentId: string }): Promise<DocumentChunkRow[]>;
}
