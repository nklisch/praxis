import type { CourseId, DocumentId, SessionId } from "./ids.js";

export type ScopeKind = "course" | "session";

/**
 * A scope owns a set of documents. A document can belong to multiple
 * scopes simultaneously — e.g., attached to a course AND remembered as
 * having been ingested during a specific bootstrap session.
 */
export type DocumentScope =
  | { kind: "course"; id: CourseId }
  | { kind: "session"; id: SessionId };

export type DocumentScopeSource = "bootstrap" | "manual" | "ingestion";

/**
 * Enriched row joining documents + document_scopes (for tool/UI output).
 * Replaces today's `DocumentSummaryItem` shape at the
 * `listForScopeDetailed` surface — `source` and `attachedAt` are scope-
 * row fields the existing summary doesn't expose, and the library view
 * wants them.
 */
export interface DocumentScopeAttachment {
  documentId: DocumentId;
  filename: string;
  mimeType: string;
  chunkCount: number;
  hasPageImages: boolean;
  source: DocumentScopeSource;
  attachedAt: Date;
}
