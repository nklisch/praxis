/**
 * Ingestor port — the `Ingestor` interface and associated types.
 * Each format has one (or more) Ingestor implementations; the IngestorRegistry
 * dispatches to the right one based on mime type / file extension.
 *
 * Follows the discriminated-union-dispatch pattern: each Ingestor has a
 * stable `id` string that the registry and IngestionService use.
 */

export interface IngestedChunk {
  /** 0-based index within the document. */
  chunkIndex: number;
  /** Raw text content of the chunk. */
  text: string;
  /** Page number (1-based). Undefined for formats without page structure. */
  page?: number;
  /** Section heading that contains this chunk (the closest preceding heading). */
  section?: string;
  /** Block type hint for downstream consumers (e.g., "SectionHeader", "Body"). */
  blockType?: "SectionHeader" | "Body" | "Code" | "Table" | "Figure";
}

export interface IngestorResult {
  /** Document title (H1 from markdown, filename fallback, etc.). */
  title: string;
  /** Total page count (set for PDFs; undefined for other formats). */
  pageCount?: number;
  /** All extracted chunks, in document order. */
  chunks: IngestedChunk[];
  /** The `Ingestor.id` of the ingestor that produced this result. */
  ingestorId: string;
  /**
   * Set by VisionPdfIngestor when page images were saved under a synthetic
   * document-id directory. IngestionService renames the directory to the real
   * documentId after persisting the document row.
   */
  pendingPageImageDocId?: string;
}

export interface IngestorOptions {
  /**
   * Abort signal. If set and aborted, the ingestor should stop processing and
   * return whatever chunks it has so far (or throw).
   */
  signal?: AbortSignal;
  /**
   * Called by VisionPdfIngestor (and only that ingestor) to report per-page
   * progress during OCR. Other ingestors don't call this.
   */
  onPageProgress?: (page: number, totalPages: number) => void;
  /**
   * Soft max characters per chunk. Chunkers respect paragraph boundaries —
   * a chunk may exceed this if a single paragraph is longer. Default: 2000.
   */
  maxChars?: number;
}

/**
 * Port interface for document ingestors. Each implementation handles one
 * or more file formats.
 */
export interface Ingestor {
  /** Stable identifier — used for registry dispatch and IngestionEvent reporting. */
  readonly id: string;
  /** Human-readable label shown in the UI (e.g., "Markdown", "PDF (text layer)"). */
  readonly label: string;
  /** File extensions this ingestor handles (lowercase, with leading dot). */
  readonly extensions: ReadonlyArray<string>;
  /** MIME types this ingestor handles. */
  readonly mimeTypes: ReadonlyArray<string>;
  /**
   * Returns false when the ingestor cannot run in the current environment
   * (e.g., VisionPdfIngestor when no vision capability is configured).
   * Registry skips unavailable ingestors when auto-selecting.
   */
  isAvailable(): Promise<boolean>;
  /**
   * Parse the file at `filePath` into chunks.
   * @throws when the file cannot be read or parsed.
   */
  parse(filePath: string, opts?: IngestorOptions): Promise<IngestorResult>;
}
