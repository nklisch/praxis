import type { Timestamp } from "./common.js";
import type { DocumentId, SessionId, StudentId } from "./ids.js";

export type TabId = string & { readonly __brand: "TabId" };

/**
 * A session-bound tab — the original tab kind.
 * Opened alongside a session via `tabs.open(...)`.
 */
export interface SessionTabSummary {
  readonly kind: "session";
  readonly id: TabId;
  readonly sessionId: SessionId;
  readonly modeId: string;
  /** Auto-generated display title (e.g. "algebra · teach"). */
  readonly title: string;
  /** Optional courseId from the underlying session (if the tab is course-bound). */
  readonly courseId?: string;
  /**
   * Phase 16: the assignment bound to this session, if any.
   * Present for quiz / homework / exam sessions; absent for teach / bootstrap.
   */
  readonly assignmentId?: string;
  readonly sortOrder: number;
  readonly openedAt: Timestamp;
  readonly lastSeenAt: Timestamp;
  /** Null when the tab is open; set when archived. */
  readonly closedAt: Timestamp | null;
}

/**
 * A document viewer tab — opened via `tabs.openDocument(...)`.
 * Has no associated session; persists the document title at open time.
 */
export interface DocumentTabSummary {
  readonly kind: "document";
  readonly id: TabId;
  readonly documentId: DocumentId;
  /** Title stored at open time (filename truncated to ~40 chars). */
  readonly title: string;
  readonly sortOrder: number;
  readonly openedAt: Timestamp;
  readonly lastSeenAt: Timestamp;
  /** Null when the tab is open; set when archived. */
  readonly closedAt: Timestamp | null;
}

/**
 * Discriminated union of all tab kinds.
 * Discriminated on `kind`: 'session' | 'document'.
 *
 * Design escape hatch: consumers that only care about the shared fields
 * (id, title, sortOrder, openedAt, lastSeenAt, closedAt) can read them
 * from either variant without a type guard. Fields that differ by kind
 * (sessionId, modeId, documentId) require narrowing on `tab.kind`.
 */
export type TabSummary = SessionTabSummary | DocumentTabSummary;

export interface TabsService {
  /** All open tabs for the student, sorted by sortOrder ascending. */
  listOpen(studentId: StudentId): Promise<TabSummary[]>;

  /**
   * All tabs for the student, optionally including closed ones.
   * Ordered by lastSeenAt descending (most recently active first).
   * `limit` defaults to 50.
   */
  list(
    studentId: StudentId,
    opts?: { limit?: number; includeClosed?: boolean },
  ): Promise<TabSummary[]>;

  /** Look up one tab by id. Returns null if not found. */
  get(tabId: TabId): Promise<TabSummary | null>;

  /**
   * Open a new tab bound to an existing session. Used after `session.start` succeeds.
   * Auto-generates the title from session metadata + mode.
   * The caller can pass `courseTitle` if known; otherwise the title falls back
   * to a mode-based default.
   */
  open(input: {
    studentId: StudentId;
    sessionId: SessionId;
    /** Optional: caller passes the course title if known, used for the auto-generated tab title. */
    courseTitle?: string;
  }): Promise<SessionTabSummary>;

  /**
   * Open a new tab bound to a document. The title is stored at open time (no join required).
   */
  openDocument(input: {
    studentId: StudentId;
    documentId: DocumentId;
    title: string;
  }): Promise<DocumentTabSummary>;

  /**
   * Reopen a previously-closed tab. Clears `closedAt`, re-assigns sortOrder to the end.
   * Returns the refreshed TabSummary. Throws if the tab doesn't exist or its session is gone.
   */
  reopen(tabId: TabId): Promise<TabSummary>;

  /**
   * Close a tab — sets `closedAt` to now. Does NOT end the underlying session.
   * The tab vanishes from the strip but stays in the archive.
   */
  close(tabId: TabId): Promise<void>;

  /**
   * Touch a tab as last-focused — bumps `lastSeenAt` to now. Called on tab activation
   * so restoring the workspace can land on the right tab.
   */
  touch(tabId: TabId): Promise<void>;

  /** Rename a tab. Used by Library context menu. */
  rename(tabId: TabId, title: string): Promise<TabSummary>;
}

// ─── TabsClientApi ────────────────────────────────────────────────────────────

/**
 * Client-facing tabs API. Differs from the server-side TabsService by dropping
 * the `studentId` parameters — the server resolves the active student from
 * the IPC context. Client code stays clean: `client.tabs.listOpen()` not
 * `client.tabs.listOpen(brandId<"StudentId">("") as StudentId)`.
 */
export interface TabsClientApi {
  listOpen(): Promise<TabSummary[]>;
  list(opts?: { limit?: number; includeClosed?: boolean }): Promise<TabSummary[]>;
  get(tabId: TabId): Promise<TabSummary | null>;
  /** Open a session-bound tab. Returns a SessionTabSummary (kind = "session"). */
  open(input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary>;
  /**
   * Open a document-bound tab. Returns a DocumentTabSummary (kind = "document").
   * The `title` is stored on the tab row at open time (filename, truncated to ~40 chars)
   * so re-opens don't need a document fetch.
   */
  openDocument(input: { documentId: DocumentId; title: string }): Promise<DocumentTabSummary>;
  reopen(tabId: TabId): Promise<TabSummary>;
  close(tabId: TabId): Promise<void>;
  touch(tabId: TabId): Promise<void>;
  rename(tabId: TabId, title: string): Promise<TabSummary>;
}
