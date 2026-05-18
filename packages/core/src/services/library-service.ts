/**
 * LibraryService — aggregates full-text search and the four saved catalogue
 * filters (from-session, orphan, due, recent) across notes and flashcards.
 *
 * Uses SQLite FTS5 (notes_fts + flashcards_fts) for ranked text search.
 * FTS5 tables are created by initArtifactsFtsStore in db/vector-init.ts.
 */

import { flashcards, notes } from "@praxis/artifacts/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import type { PraxisDb, SqliteDatabase } from "../db/index.js";
import type {
  FlashcardId,
  FlashcardLibraryHit,
  LibraryHit,
  LibrarySearchInput,
  LibraryService,
  NoteId,
  NoteLibraryHit,
  SessionId,
  StudentId,
  Timestamp,
} from "../types/index.js";

export type { LibraryHit, LibrarySearchInput, LibraryService };

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface LibraryServiceDeps {
  db: PraxisDb;
  /** Raw better-sqlite3 connection for FTS5 prepare statements. */
  sqlite: SqliteDatabase;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class LibraryServiceImpl implements LibraryService {
  constructor(private readonly deps: LibraryServiceDeps) {}

  async search(input: LibrarySearchInput): Promise<LibraryHit[]> {
    const limit = input.limit ?? 200;
    const now = Date.now();

    const noteHits = this.#searchNotes(input, now, limit);
    const cardHits = this.#searchFlashcards(input, now, limit);

    const merged: LibraryHit[] = [...noteHits, ...cardHits];
    return merged.slice(0, limit);
  }

  // ── Notes ───────────────────────────────────────────────────────────────────

  #searchNotes(input: LibrarySearchInput, now: number, limit: number): NoteLibraryHit[] {
    const { studentId, query, sessionId, orphan, dueOnly, recentWindowMs } = input;

    // Notes have no nextReviewAt — dueOnly is a flashcard-only filter.
    if (dueOnly) return [];

    if (query) {
      return this.#ftsSearchNotes(studentId, query, input, now, limit);
    }

    // Non-FTS path via Drizzle.
    // biome-ignore lint/suspicious/noExplicitAny: dynamic where conditions
    const conditions: any[] = [eq(notes.studentId, studentId)];

    if (sessionId !== undefined) {
      conditions.push(eq(notes.sessionId, sessionId));
    }

    if (recentWindowMs !== undefined) {
      const cutoff = now - recentWindowMs;
      conditions.push(sql`${notes.updatedAt} >= ${cutoff}`);
    }

    const rows = this.deps.db
      .select()
      .from(notes)
      .where(and(...conditions))
      .limit(limit)
      .all();

    let results = rows.map(rowToNoteHit);

    if (orphan) {
      results = results.filter(isOrphanNote);
    }

    return results;
  }

  #ftsSearchNotes(
    studentId: StudentId,
    query: string,
    input: LibrarySearchInput,
    now: number,
    limit: number,
  ): NoteLibraryHit[] {
    const { sessionId, orphan, dueOnly, recentWindowMs } = input;

    // Notes have no nextReviewAt — dueOnly is a flashcard-only filter.
    if (dueOnly) return [];

    // BM25: lower (more negative) = better relevance. ORDER ASC puts best first.
    let sqlStr = `
      SELECT n.id, n.student_id, n.session_id, n.format,
             n.body, n.links_json,
             n.created_at, n.updated_at,
             bm25(notes_fts) AS fts_rank
      FROM notes_fts
      JOIN notes AS n ON n.rowid = notes_fts.rowid
      WHERE notes_fts MATCH ?
        AND n.student_id = ?
    `;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic param list
    const params: any[] = [query, studentId];

    if (sessionId !== undefined) {
      sqlStr += ` AND n.session_id = ?`;
      params.push(sessionId);
    }
    if (recentWindowMs !== undefined) {
      sqlStr += ` AND n.updated_at >= ?`;
      params.push(now - recentWindowMs);
    }

    sqlStr += ` ORDER BY fts_rank LIMIT ?`;
    params.push(limit);

    // biome-ignore lint/suspicious/noExplicitAny: raw sqlite row
    let hits = this.deps.sqlite
      .prepare<any[], any>(sqlStr)
      .all(...params)
      .map(rawRowToNoteHit);

    if (orphan) {
      hits = hits.filter(isOrphanNote);
    }

    return hits;
  }

  // ── Flashcards ──────────────────────────────────────────────────────────────

  #searchFlashcards(input: LibrarySearchInput, now: number, limit: number): FlashcardLibraryHit[] {
    const { studentId, query, sessionId, orphan, dueOnly } = input;

    // Flashcards have no session_id column — from-session filter not applicable.
    if (sessionId !== undefined) {
      return [];
    }

    if (query) {
      return this.#ftsSearchFlashcards(studentId, query, input, now, limit);
    }

    // biome-ignore lint/suspicious/noExplicitAny: dynamic conditions
    const conditions: any[] = [eq(flashcards.studentId, studentId)];

    if (dueOnly) {
      conditions.push(lte(flashcards.nextReviewAt, new Date(now)));
    }

    const rows = this.deps.db
      .select()
      .from(flashcards)
      .where(and(...conditions))
      .limit(limit)
      .all();

    let hits = rows.map(rowToFlashcardHit);

    if (orphan) {
      hits = hits.filter(isOrphanFlashcard);
    }

    return hits;
  }

  #ftsSearchFlashcards(
    studentId: StudentId,
    query: string,
    input: LibrarySearchInput,
    now: number,
    limit: number,
  ): FlashcardLibraryHit[] {
    const { dueOnly, orphan } = input;

    let sqlStr = `
      SELECT fc.id, fc.student_id, fc.concept_id, fc.front, fc.back,
             fc.next_review_at,
             bm25(flashcards_fts) AS fts_rank
      FROM flashcards_fts
      JOIN flashcards AS fc ON fc.rowid = flashcards_fts.rowid
      WHERE flashcards_fts MATCH ?
        AND fc.student_id = ?
    `;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic param list
    const params: any[] = [query, studentId];

    if (dueOnly) {
      sqlStr += ` AND (fc.next_review_at IS NULL OR fc.next_review_at <= ?)`;
      params.push(now);
    }

    sqlStr += ` ORDER BY fts_rank LIMIT ?`;
    params.push(limit);

    // biome-ignore lint/suspicious/noExplicitAny: raw sqlite row
    let hits = this.deps.sqlite
      .prepare<any[], any>(sqlStr)
      .all(...params)
      .map(rawRowToFlashcardHit);

    if (orphan) {
      hits = hits.filter(isOrphanFlashcard);
    }

    return hits;
  }
}

// ─── Row converters ───────────────────────────────────────────────────────────

function rowToNoteHit(row: typeof notes.$inferSelect): NoteLibraryHit {
  return {
    kind: "note",
    id: row.id as NoteId,
    studentId: row.studentId as StudentId,
    format: row.format,
    body: row.body ?? null,
    sessionId: row.sessionId ?? null,
    linksJson: row.linksJson,
    createdAt: row.createdAt.getTime() as Timestamp,
    updatedAt: row.updatedAt.getTime() as Timestamp,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: raw better-sqlite3 row
function rawRowToNoteHit(row: any): NoteLibraryHit {
  return {
    kind: "note",
    id: row.id as NoteId,
    studentId: row.student_id as StudentId,
    format: row.format as string,
    body: (row.body as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    linksJson: row.links_json != null ? JSON.parse(row.links_json as string) : [],
    createdAt: row.created_at as number as Timestamp,
    updatedAt: row.updated_at as number as Timestamp,
  };
}

function rowToFlashcardHit(row: typeof flashcards.$inferSelect): FlashcardLibraryHit {
  return {
    kind: "flashcard",
    id: row.id as FlashcardId,
    studentId: row.studentId as StudentId,
    front: row.front,
    back: row.back,
    conceptId: row.conceptId ?? null,
    nextReviewAt: row.nextReviewAt ? (row.nextReviewAt.getTime() as Timestamp) : null,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: raw better-sqlite3 row
function rawRowToFlashcardHit(row: any): FlashcardLibraryHit {
  return {
    kind: "flashcard",
    id: row.id as FlashcardId,
    studentId: row.student_id as StudentId,
    front: row.front as string,
    back: row.back as string,
    conceptId: (row.concept_id as string | null) ?? null,
    nextReviewAt: row.next_review_at != null ? (row.next_review_at as number as Timestamp) : null,
  };
}

// ─── Orphan predicates ────────────────────────────────────────────────────────

/**
 * A note is "orphan" when its linksJson contains no course-kind ArtifactRef.
 */
function isOrphanNote(hit: NoteLibraryHit): boolean {
  // biome-ignore lint/suspicious/noExplicitAny: linksJson is JSON from DB
  const links = (hit.linksJson as any[]) ?? [];
  // biome-ignore lint/suspicious/noExplicitAny: ArtifactRef from JSON
  return !links.some((l: any) => l && l.kind === "course");
}

/** A flashcard is "orphan" when it has no conceptId. */
function isOrphanFlashcard(hit: FlashcardLibraryHit): boolean {
  return hit.conceptId == null;
}
