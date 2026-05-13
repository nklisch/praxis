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
