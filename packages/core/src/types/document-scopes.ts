import type { CourseId, DocumentId, SessionId, StudentId } from "./ids.js";

export type ScopeKind = "course" | "session";

/**
 * A scope owns a set of documents. A document can belong to multiple
 * scopes simultaneously — e.g., attached to a course AND remembered as
 * having been ingested during a specific bootstrap session.
 */
export type DocumentScope = { kind: "course"; id: CourseId } | { kind: "session"; id: SessionId };

export type DocumentScopeSource = "course-create" | "manual" | "ingestion";

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

// ─── DocumentScopesService ───────────────────────────────────────────────────

/**
 * Many-to-many between scopes (course, session, …) and the student's
 * library documents. A document can be attached to zero, one, or many
 * scopes. The student library (`documents` table) is the SSOT — this
 * service only manages links.
 */
export interface DocumentScopesService {
  /**
   * Documents owned by the student that are effectively orphaned:
   * either no scope rows at all, or all scope rows point at parents that
   * no longer exist (deleted course / session). Returns enriched rows
   * suitable for direct library rendering.
   */
  listOrphaned(studentId: StudentId): Promise<DocumentScopeAttachment[]>;

  /** All document ids attached to a scope, in attach order. */
  listForScope(scope: DocumentScope): Promise<DocumentId[]>;

  /** Enriched summaries for the scope's documents (tool / UI output). */
  listForScopeDetailed(scope: DocumentScope): Promise<DocumentScopeAttachment[]>;

  /**
   * Attach. Idempotent on (documentId, scope.kind, scope.id).
   * Returns true iff a row was inserted.
   * `passageRange` is optional; when set, stores the character-level range
   * on the scope row so the document viewer can render a `†` marker.
   */
  attach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
    source: DocumentScopeSource;
    passageRange?: { startOffset: number; endOffset: number };
  }): Promise<{ attached: boolean }>;

  /** Detach. Idempotent. */
  detach(input: { scope: DocumentScope; documentId: DocumentId }): Promise<{ detached: boolean }>;

  /**
   * Bulk attach (e.g., confirm-draft, multi-file ingest). Skips
   * already-attached documents. Returns the newly attached ids.
   */
  attachMany(input: {
    scope: DocumentScope;
    documentIds: ReadonlyArray<DocumentId>;
    source: DocumentScopeSource;
  }): Promise<{ newlyAttached: DocumentId[] }>;

  /**
   * All scopes a document is currently attached to.
   * Used by Orphaned detection in the library view (a document with
   * zero scope rows is orphaned).
   */
  listScopesForDocument(documentId: DocumentId): Promise<DocumentScope[]>;

  /**
   * Promote every document in `from` into `to` (idempotent per row).
   * Used by bootstrap-session-scoped-attachment when a draft is
   * confirmed — session-scope rows promote to course-scope while the
   * session rows persist for audit. Source rows are NOT removed.
   */
  promoteScope(input: {
    from: DocumentScope;
    to: DocumentScope;
    source: DocumentScopeSource;
  }): Promise<{ promoted: DocumentId[] }>;
}
