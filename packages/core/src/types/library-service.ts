import type { Timestamp } from "./common.js";
import type { FlashcardId, NoteId, SessionId, StudentId } from "./ids.js";

// ─── LibraryService ───────────────────────────────────────────────────────────

/** A matched note summary returned by LibraryService.search. */
export interface NoteLibraryHit {
  kind: "note";
  id: NoteId;
  studentId: StudentId;
  format: string;
  body: string | null;
  sessionId: string | null;
  /** Raw links_json array. */
  linksJson: unknown;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A matched flashcard summary returned by LibraryService.search. */
export interface FlashcardLibraryHit {
  kind: "flashcard";
  id: FlashcardId;
  studentId: StudentId;
  front: string;
  back: string;
  conceptId: string | null;
  nextReviewAt: Timestamp | null;
}

export type LibraryHit = NoteLibraryHit | FlashcardLibraryHit;

export interface LibrarySearchInput {
  studentId: StudentId;
  query?: string;
  sessionId?: SessionId;
  orphan?: boolean;
  dueOnly?: boolean;
  recentWindowMs?: number;
  limit?: number;
}

/** Server-side LibraryService. */
export interface LibraryService {
  search(input: LibrarySearchInput): Promise<LibraryHit[]>;
}

// ─── Library (client-side) ────────────────────────────────────────────────────

/**
 * Client-facing library search API. The studentId is resolved server-side
 * from the single-student v1 install context, so it is omitted here.
 */
export interface LibraryClientApi {
  /**
   * Full-text search + saved filter across notes and flashcards.
   *
   * Filters compose with AND. No filter → all results (capped by limit).
   * When `query` is set, FTS5 BM25 ranking is applied. `studentId` is
   * resolved server-side.
   */
  search(input: Omit<LibrarySearchInput, "studentId">): Promise<LibraryHit[]>;
}
