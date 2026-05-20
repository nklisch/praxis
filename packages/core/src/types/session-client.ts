import type { Timestamp } from "./common.js";
import type { EngineEvent } from "./engine.js";
import type {
  AssignmentId,
  CourseId,
  DocumentId,
  GateId,
  NoteId,
  SessionId,
  StudentId,
} from "./ids.js";

export interface SessionService {
  // courseId is optional in Phase 3 (no courses yet).
  start(opts: {
    courseId?: CourseId;
    /** Phase 8: bind an assignment to this session. Persisted on sessions.assignment_id. */
    assignmentId?: AssignmentId;
    modeId: string;
  }): Promise<SessionHandle>;
  send(sessionId: SessionId, message: string, signal?: AbortSignal): AsyncIterable<EngineEvent>;
  end(sessionId: SessionId): Promise<SessionEndSummary>;
  active(opts?: { modeId?: string }): Promise<SessionHandle | null>;
  /**
   * Phase 14: List sessions for the student, ordered by startedAt descending.
   * Used by the Library archive section and tab-restoration logic.
   *
   * @param opts.includeEnded - when true, includes sessions with endedAt set. Default true.
   * @param opts.limit - default 100.
   * @param opts.excludeModeIds - when non-empty, sessions whose modeId is in the array are excluded.
   *   Filtering is applied at the DB layer so that `limit` counts only non-excluded sessions.
   */
  list(opts?: {
    includeEnded?: boolean;
    limit?: number;
    excludeModeIds?: string[];
  }): Promise<SessionSummary[]>;
  /**
   * Phase 16: open a child session bound to an assignment, deriving the mode
   * from the assignment's kind. The child session's parentSessionId is set to
   * `parentSessionId` so tabs can link back to the tutor session.
   */
  spawnFromAssignment(input: {
    assignmentId: AssignmentId;
    parentSessionId: SessionId;
  }): Promise<SessionHandle>;
  /**
   * Open a new teach session pre-loaded with a note's cue context.
   * `studentId` may be omitted — the service resolves it via getOrCreateDefaultStudentId.
   * `cueId` is the string-encoded index of the cue (e.g. "0", "1"); if omitted, uses
   * the note's first cue. The opening message wraps cue + body in structured XML tags
   * so the tutor starts the conversation with the right context.
   */
  spawnFromNote(input: {
    studentId?: StudentId;
    noteId: NoteId;
    cueId?: string;
  }): Promise<SessionHandle>;
  /**
   * Open a new teach session scoped to a passage in a document.
   * `studentId` may be omitted — the service resolves it via getOrCreateDefaultStudentId.
   * The passage text is injected into the opening message wrapped in `<passage>` tags.
   * The document is attached to the session with the passage range so the document
   * viewer can render a `†` marker on the cited range.
   */
  spawnFromPassage(input: {
    studentId?: StudentId;
    documentId: DocumentId;
    range: { startOffset: number; endOffset: number };
  }): Promise<SessionHandle>;
}

export interface SessionHandle {
  sessionId: SessionId;
  courseId?: CourseId; // optional per above
  /** Phase 8: the assignment this session is bound to (quiz/homework/exam sessions). */
  assignmentId?: AssignmentId;
  modeId: string;
  startedAt: Timestamp;
  /**
   * Phase 16: the teach-mode session that spawned this child session.
   * Set when this session was opened via `spawnFromAssignment`.
   */
  parentSessionId?: SessionId;
}

/**
 * Returned by `session.end()` — contains gate unlock results and end metadata.
 * Renamed from SessionSummary in Phase 14 to avoid collision with the list-view type.
 */
export interface SessionEndSummary {
  sessionId: SessionId;
  endedAt: Timestamp;
  unlockedGates: GateId[];
  newMisconceptions: number;
  reflection?: string;
}

/**
 * Phase 14: Lightweight session summary for `session.list()` and the Library archive.
 * Distinct from SessionEndSummary (the end-of-session result from `session.end()`).
 */
export interface SessionSummary {
  readonly sessionId: SessionId;
  readonly modeId: string;
  readonly courseId?: CourseId;
  readonly assignmentId?: AssignmentId;
  readonly startedAt: Timestamp;
  /** Null when the session is still open. */
  readonly endedAt: Timestamp | null;
  /** First user message, truncated to 60 chars + ellipsis if longer. Used as a deck line in Library. */
  readonly firstUserMessage?: string;
}

export interface CreateCourseInput {
  title: string;
  subject: string;
  gradeLevel: string;
  authorRole: "parent" | "teacher" | "self-directed";
}

export interface FileRef {
  path: string;
  filename: string;
  mimeType: string;
}

export interface BootstrapOpts {
  courseTitle: string;
  subject: string;
  gradeLevel: string;
}
