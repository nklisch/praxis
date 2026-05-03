import type { Timestamp } from "./common.js";
import type { SessionId, StudentId } from "./ids.js";

export type TabId = string & { readonly __brand: "TabId" };

/** Returned by TabsService.list/listOpen — derived from the DB row plus session metadata. */
export interface TabSummary {
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
  }): Promise<TabSummary>;

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
