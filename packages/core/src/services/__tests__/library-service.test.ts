/**
 * Tests for LibraryServiceImpl.
 *
 * Covers:
 *  - sessionId filter: returns notes from the given session only
 *  - orphan filter: notes with no course link; flashcards with no conceptId
 *  - dueOnly filter: flashcards with next_review_at <= now
 *  - recentWindowMs filter: notes updated within the window
 *  - query FTS5 search: returns ranked results; delete → no longer returned
 *  - combined filter: query + sessionId
 *
 * FTS5 trigger sync (insert/update/delete on notes) is verified by:
 *  - insert: FTS search returns the note
 *  - update: FTS search finds the new body text
 *  - delete: FTS search no longer returns the deleted note
 */

import { flashcards, notes } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type { FlashcardId, NoteId, SessionId, StudentId } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { LibraryServiceImpl } from "../library-service.js";

const db = useTempDb();

const STUDENT_A = brandId<"StudentId">("student-a") as StudentId;
const STUDENT_B = brandId<"StudentId">("student-b") as StudentId;
const SESSION_1 = brandId<"SessionId">("session-1") as SessionId;
const SESSION_2 = brandId<"SessionId">("session-2") as SessionId;

function makeService() {
  const { db: drizzle, sqlite } = openDb({ path: db.dbPath });
  return new LibraryServiceImpl({ db: drizzle, sqlite });
}

function insertNote(opts: {
  id: string;
  studentId: StudentId;
  sessionId?: string;
  body?: string;
  linksJson?: unknown;
  updatedAt?: Date;
}): NoteId {
  const { db: drizzle } = openDb({ path: db.dbPath });
  const now = opts.updatedAt ?? new Date();
  drizzle
    .insert(notes)
    .values({
      id: opts.id,
      studentId: opts.studentId,
      sessionId: opts.sessionId ?? null,
      contextJson: opts.sessionId ? { sessionId: opts.sessionId } : {},
      format: "free",
      body: opts.body ?? `body of ${opts.id}`,
      sketchSceneJson: null,
      linksJson: (opts.linksJson ?? []) as object[],
      createdAt: new Date(),
      updatedAt: now,
    })
    .run();
  return brandId<"NoteId">(opts.id) as NoteId;
}

function insertFlashcard(opts: {
  id: string;
  studentId: StudentId;
  conceptId?: string;
  front?: string;
  back?: string;
  nextReviewAt?: Date | null;
}): FlashcardId {
  const { db: drizzle } = openDb({ path: db.dbPath });
  drizzle
    .insert(flashcards)
    .values({
      id: opts.id,
      studentId: opts.studentId,
      conceptId: opts.conceptId ?? null,
      front: opts.front ?? `front of ${opts.id}`,
      back: opts.back ?? `back of ${opts.id}`,
      reviewStateJson: { algorithm: "fsrs", state: {}, reps: 0, lapses: 0 },
      sourceJson: { kind: "user-created" },
      nextReviewAt: opts.nextReviewAt === undefined ? null : opts.nextReviewAt,
    })
    .run();
  return brandId<"FlashcardId">(opts.id) as FlashcardId;
}

// ── sessionId filter ─────────────────────────────────────────────────────────

describe("sessionId filter", () => {
  it("returns only notes from the specified session", async () => {
    const svc = makeService();

    insertNote({ id: "n-sess1-a", studentId: STUDENT_A, sessionId: SESSION_1 });
    insertNote({ id: "n-sess1-b", studentId: STUDENT_A, sessionId: SESSION_1 });
    insertNote({ id: "n-sess2", studentId: STUDENT_A, sessionId: SESSION_2 });
    insertNote({ id: "n-nosess", studentId: STUDENT_A });

    const hits = await svc.search({ studentId: STUDENT_A, sessionId: SESSION_1 });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("n-sess1-a");
    expect(ids).toContain("n-sess1-b");
    expect(ids).not.toContain("n-sess2");
    expect(ids).not.toContain("n-nosess");
  });

  it("excludes flashcards (no session_id column) when sessionId filter is set", async () => {
    const svc = makeService();

    insertNote({ id: "n-sess3", studentId: STUDENT_A, sessionId: SESSION_1 });
    insertFlashcard({ id: "fc-orphan", studentId: STUDENT_A });

    const hits = await svc.search({ studentId: STUDENT_A, sessionId: SESSION_1 });
    const kinds = hits.map((h) => h.kind);
    expect(kinds).not.toContain("flashcard");
  });
});

// ── orphan filter ─────────────────────────────────────────────────────────────

describe("orphan filter", () => {
  it("returns notes with no course link in linksJson", async () => {
    const svc = makeService();

    insertNote({ id: "n-orphan", studentId: STUDENT_A, linksJson: [] });
    insertNote({
      id: "n-linked",
      studentId: STUDENT_A,
      linksJson: [{ kind: "course", id: "c-1" }],
    });

    const hits = await svc.search({ studentId: STUDENT_A, orphan: true });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("n-orphan");
    expect(ids).not.toContain("n-linked");
  });

  it("returns flashcards with no conceptId", async () => {
    const svc = makeService();

    insertFlashcard({ id: "fc-orphan-2", studentId: STUDENT_A, conceptId: undefined });
    insertFlashcard({ id: "fc-linked", studentId: STUDENT_A, conceptId: "concept-x" });

    const hits = await svc.search({ studentId: STUDENT_A, orphan: true });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("fc-orphan-2");
    expect(ids).not.toContain("fc-linked");
  });
});

// ── dueOnly filter ────────────────────────────────────────────────────────────

describe("dueOnly filter", () => {
  it("returns only flashcards where next_review_at <= now", async () => {
    const svc = makeService();

    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);

    insertFlashcard({ id: "fc-due", studentId: STUDENT_A, nextReviewAt: past });
    insertFlashcard({ id: "fc-future", studentId: STUDENT_A, nextReviewAt: future });

    const hits = await svc.search({ studentId: STUDENT_A, dueOnly: true });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("fc-due");
    expect(ids).not.toContain("fc-future");
  });

  it("does not return notes (they have no nextReviewAt)", async () => {
    const svc = makeService();

    insertNote({ id: "n-for-due", studentId: STUDENT_A });

    const hits = await svc.search({ studentId: STUDENT_A, dueOnly: true });
    const kinds = hits.map((h) => h.kind);
    expect(kinds).not.toContain("note");
  });
});

// ── dueOnly + FTS NULL consistency ───────────────────────────────────────────

describe("dueOnly NULL nextReviewAt consistency (FTS vs non-FTS)", () => {
  it("excludes flashcard with NULL nextReviewAt from dueOnly (non-FTS path)", async () => {
    const svc = makeService();

    insertFlashcard({ id: "fc-null-nofts", studentId: STUDENT_A, nextReviewAt: null });

    const hits = await svc.search({ studentId: STUDENT_A, dueOnly: true });
    expect(hits.map((h) => h.id)).not.toContain("fc-null-nofts");
  });

  it("excludes flashcard with NULL nextReviewAt from dueOnly+query (FTS path)", async () => {
    const svc = makeService();

    insertFlashcard({
      id: "fc-null-fts",
      studentId: STUDENT_A,
      front: "unique cellulose fiber question",
      back: "plant cell walls",
      nextReviewAt: null,
    });

    const hits = await svc.search({ studentId: STUDENT_A, dueOnly: true, query: "cellulose" });
    expect(hits.map((h) => h.id)).not.toContain("fc-null-fts");
  });
});

// ── recentWindowMs filter ─────────────────────────────────────────────────────

describe("recentWindowMs filter", () => {
  it("returns notes updated within the window", async () => {
    const svc = makeService();

    const recent = new Date(Date.now() - 1000); // 1 s ago
    const old = new Date(Date.now() - 200_000); // ~3 min ago

    insertNote({ id: "n-recent", studentId: STUDENT_A, updatedAt: recent });
    insertNote({ id: "n-old", studentId: STUDENT_A, updatedAt: old });

    const hits = await svc.search({ studentId: STUDENT_A, recentWindowMs: 60_000 }); // 1 min
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("n-recent");
    expect(ids).not.toContain("n-old");
  });
});

// ── FTS5 query search ─────────────────────────────────────────────────────────

describe("FTS5 query search", () => {
  it("returns notes matching the query text", async () => {
    const svc = makeService();

    insertNote({
      id: "n-fts-match",
      studentId: STUDENT_B,
      body: '{"kind":"free","text":"photosynthesis converts light energy"}',
    });
    insertNote({
      id: "n-fts-miss",
      studentId: STUDENT_B,
      body: '{"kind":"free","text":"mitosis divides the cell"}',
    });

    const hits = await svc.search({ studentId: STUDENT_B, query: "photosynthesis" });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("n-fts-match");
    expect(ids).not.toContain("n-fts-miss");
  });

  it("returns flashcards matching the query text", async () => {
    const svc = makeService();

    insertFlashcard({
      id: "fc-fts-match",
      studentId: STUDENT_B,
      front: "What is osmosis?",
      back: "movement of water across a membrane",
    });
    insertFlashcard({
      id: "fc-fts-miss",
      studentId: STUDENT_B,
      front: "What is mitosis?",
      back: "cell division process",
    });

    const hits = await svc.search({ studentId: STUDENT_B, query: "osmosis" });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("fc-fts-match");
    expect(ids).not.toContain("fc-fts-miss");
  });

  it("does not throw for malformed FTS query syntax", async () => {
    const svc = makeService();

    insertNote({
      id: "n-malformed-query",
      studentId: STUDENT_B,
      body: '{"kind":"free","text":"chlorophyll absorbs light"}',
    });
    insertFlashcard({
      id: "fc-malformed-query",
      studentId: STUDENT_B,
      front: "What does chlorophyll absorb?",
      back: "light",
    });

    await expect(
      svc.search({ studentId: STUDENT_B, query: 'chlorophyll "light' }),
    ).resolves.toEqual(expect.any(Array));
  });

  it("combines query + sessionId filters (AND semantics)", async () => {
    const svc = makeService();

    insertNote({
      id: "n-combo-both",
      studentId: STUDENT_B,
      sessionId: SESSION_1,
      body: '{"kind":"free","text":"enzyme kinetics topic"}',
    });
    insertNote({
      id: "n-combo-nosess",
      studentId: STUDENT_B,
      body: '{"kind":"free","text":"enzyme kinetics elsewhere"}',
    });
    insertNote({
      id: "n-combo-noquery",
      studentId: STUDENT_B,
      sessionId: SESSION_1,
      body: '{"kind":"free","text":"unrelated content here"}',
    });

    const hits = await svc.search({ studentId: STUDENT_B, query: "enzyme", sessionId: SESSION_1 });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("n-combo-both");
    expect(ids).not.toContain("n-combo-nosess");
    expect(ids).not.toContain("n-combo-noquery");
  });
});

// ── FTS5 trigger sync: delete → no longer found ───────────────────────────────

describe("FTS5 trigger sync", () => {
  it("note is no longer found after deletion", async () => {
    const svc = makeService();
    const { db: drizzle } = openDb({ path: db.dbPath });

    insertNote({
      id: "n-del",
      studentId: STUDENT_B,
      body: '{"kind":"free","text":"unique phospholipid bilayer content"}',
    });

    // Confirm it's searchable.
    let hits = await svc.search({ studentId: STUDENT_B, query: "phospholipid" });
    expect(hits.map((h) => h.id)).toContain("n-del");

    // Delete and confirm FTS is updated.
    drizzle.delete(notes).where(eq(notes.id, "n-del")).run();

    hits = await svc.search({ studentId: STUDENT_B, query: "phospholipid" });
    expect(hits.map((h) => h.id)).not.toContain("n-del");
  });

  it("note body update is reflected in FTS search", async () => {
    const svc = makeService();
    const { db: drizzle } = openDb({ path: db.dbPath });

    insertNote({
      id: "n-upd",
      studentId: STUDENT_B,
      body: '{"kind":"free","text":"ribosomes synthesize proteins"}',
    });

    // Update the body.
    drizzle
      .update(notes)
      .set({ body: '{"kind":"free","text":"mitochondria produce ATP"}', updatedAt: new Date() })
      .where(eq(notes.id, "n-upd"))
      .run();

    // Old term gone, new term present.
    const oldHits = await svc.search({ studentId: STUDENT_B, query: "ribosomes" });
    expect(oldHits.map((h) => h.id)).not.toContain("n-upd");

    const newHits = await svc.search({ studentId: STUDENT_B, query: "mitochondria" });
    expect(newHits.map((h) => h.id)).toContain("n-upd");
  });

  it("flashcard is no longer found after deletion", async () => {
    const svc = makeService();
    const { db: drizzle } = openDb({ path: db.dbPath });

    insertFlashcard({
      id: "fc-del",
      studentId: STUDENT_B,
      front: "unique glycolysis pathway",
      back: "produces 2 ATP",
    });

    let hits = await svc.search({ studentId: STUDENT_B, query: "glycolysis" });
    expect(hits.map((h) => h.id)).toContain("fc-del");

    drizzle.delete(flashcards).where(eq(flashcards.id, "fc-del")).run();

    hits = await svc.search({ studentId: STUDENT_B, query: "glycolysis" });
    expect(hits.map((h) => h.id)).not.toContain("fc-del");
  });
});

// ── student isolation ─────────────────────────────────────────────────────────

describe("student isolation", () => {
  it("never returns results from a different student", async () => {
    const svc = makeService();

    insertNote({ id: "n-student-a", studentId: STUDENT_A });
    insertNote({ id: "n-student-b", studentId: STUDENT_B });

    const hitsA = await svc.search({ studentId: STUDENT_A });
    expect(hitsA.map((h) => h.id)).not.toContain("n-student-b");

    const hitsB = await svc.search({ studentId: STUDENT_B });
    expect(hitsB.map((h) => h.id)).not.toContain("n-student-a");
  });
});

// ── empty result + limit ──────────────────────────────────────────────────────

describe("empty filter set", () => {
  it("returns all notes+flashcards for the student (capped by limit)", async () => {
    const svc = makeService();

    insertNote({ id: "n-all-1", studentId: STUDENT_A });
    insertNote({ id: "n-all-2", studentId: STUDENT_A });
    insertFlashcard({ id: "fc-all-1", studentId: STUDENT_A });

    const hits = await svc.search({ studentId: STUDENT_A });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("n-all-1");
    expect(ids).toContain("n-all-2");
    expect(ids).toContain("fc-all-1");
  });

  it("respects the limit parameter", async () => {
    const svc = makeService();

    for (let i = 0; i < 5; i++) {
      insertNote({ id: `n-limit-${i}`, studentId: STUDENT_B });
    }

    const hits = await svc.search({ studentId: STUDENT_B, limit: 3 });
    expect(hits.length).toBeLessThanOrEqual(3);
  });
});
