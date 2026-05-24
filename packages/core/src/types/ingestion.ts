import type { DocumentScope } from "./document-scopes.js";

/**
 * Ingestion event stream types for Phase 5 document RAG.
 * Uses a `type` discriminator following the discriminated-union-dispatch pattern.
 */

export type IngestionEvent =
  | { type: "start"; documentId: string; filename: string }
  | { type: "ingestor_selected"; ingestorId: string; ingestorLabel: string }
  | { type: "parsing"; message: string }
  /** Emitted only by VisionPdfIngestor — one event per rendered page. */
  | { type: "vision_page"; page: number; totalPages: number }
  | { type: "parsed"; chunkCount: number }
  | { type: "indexing"; chunksProcessed: number; totalChunks: number }
  | { type: "done"; documentId: string; chunkCount: number }
  | { type: "error"; error: { code: string; message: string; recoverable: boolean } };

export interface IngestionRequest {
  filePath: string;
  filename: string;
  mimeType: string;
  studentId: string;
  /** Override ingestor selection. Default: registry auto-selects. */
  preferIngestorId?: string;
  /**
   * When set, the resulting document is auto-attached to this scope
   * (source: "ingestion") on successful ingestion. Used by the UI when
   * the "Add document" button is pressed inside a course detail view.
   * Best-effort: if the attach fails, the document still persists and
   * the done event is still emitted (attach failure is logged as a warning).
   */
  scope?: DocumentScope;
}

// ─── Phase 5: Ingestion + Documents client surface ───────────────────────────

export interface DocumentSummary {
  documentId: string;
  filename: string;
  mimeType: string;
  ingestorId: string;
  ingestorLabel: string;
  chunkCount: number;
  /** ISO-8601 string. */
  createdAt: string;
  /** Whether page images were saved (vision-tier ingestion only). */
  hasPageImages: boolean;
}

/**
 * Full document detail — a single-document look-up that includes fields
 * not surfaced in the lightweight `DocumentSummary` list response.
 *
 * Returned by `documents.get(documentId)`. Null when the document does
 * not exist (deleted or invalid id).
 */
export interface DocumentDetail extends DocumentSummary {
  /** Title extracted by the ingestor (from manifest). Null when not set. */
  title: string | null;
  /**
   * Total number of rasterised page images stored for this document.
   * Null when the ingestor did not produce page images (e.g. plain text).
   */
  pageCount: number | null;
  /**
   * Full document text: chunks joined with `\n\n` in chunk-index order.
   * Used by the markdown, HTML, and structured renderers.
   * Empty string when the document has no chunks.
   */
  text: string;
}

export interface IngestionClient {
  /** Open a native file picker. Returns the selected file path, or null if cancelled. */
  pickFile(): Promise<string | null>;
  /**
   * Open a multi-file or folder picker.
   * - mode="files": multi-selection file dialog; returns selected file paths (empty if cancelled).
   * - mode="folder": folder dialog; returns all supported files recursively walked from the
   *   picked folder (depth cap 5, no symlinks, no hidden files).
   */
  pickPaths(opts: { mode: "files" | "folder" }): Promise<string[]>;
  /** Begin ingestion. Yields progress events until done or error. */
  start(req: IngestionRequest): AsyncIterable<IngestionEvent>;
  /** Whether the ingestion IPC channel is available in this context. */
  isAvailable(): boolean;
  /**
   * Write raw text content to an OS temp file and return the absolute path.
   * Used by the Paste source tab: the renderer sends pasted text to the main
   * process which writes it to tmpdir, then the renderer calls start() with the
   * returned path. Filename is e.g. "Pasted notes (2026-05-23).txt".
   */
  writeTempText(content: string, filename: string): Promise<string>;
}

export interface DocumentsClient {
  list(): Promise<DocumentSummary[]>;
  /**
   * Fetch full detail for a single document, including pageCount and full text.
   * Returns null when the document does not exist.
   */
  get(documentId: string): Promise<DocumentDetail | null>;
  delete(documentId: string): Promise<void>;
  /**
   * Fetch the PNG bytes for a saved page render. Returns null if not available.
   * Uint8Array (rather than Buffer) so the type works in the renderer/browser context.
   */
  pageImage(input: { documentId: string; page: number }): Promise<Uint8Array | null>;
}
