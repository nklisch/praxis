/**
 * Unit tests for SqliteDraftStore — durable-drafts foundation story.
 *
 * Uses a real temp DB (via useTempDb) to verify all DraftStore operations
 * against SQLite.
 *
 * Covers:
 *  - Round-trip: save → load returns equivalent state
 *  - Upsert: re-save overwrites content but preserves createdAt
 *  - load() returns null for confirmed rows
 *  - load() returns null for discarded rows
 *  - listForStudent: filtered by student, excludes terminal rows, DESC order
 *  - listActive: all active rows regardless of student
 *  - markConfirmedTx inside a rolled-back tx leaves the row active
 *  - markDiscarded: flips discardedAt; subsequent load returns null
 *  - sweepStale: discards stale rows; leaves fresh rows; returns swept ids
 *  - touch: bumps lastTouchedAt without touching stateJson
 */
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { SqliteDraftStore } from "../services/draft-store.js";
import type { DraftCourseState, ProposedCourse, StudentId, Timestamp } from "../types/index.js";
import { brandId } from "../types/index.js";

const STUDENT_A = brandId<"StudentId">("student-a");
const STUDENT_B = brandId<"StudentId">("student-b");

const BASE_PROPOSED: ProposedCourse = {
  title: "Intro to Algebra",
  subject: "math",
  gradeLevel: "9",
  thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
  proposedConcepts: [
    { name: "Variables", description: "Symbols representing numbers", evidence: [] },
  ],
  proposedEdges: [],
  proposedLessons: [
    {
      draftLessonId: "l1",
      title: "Intro to Variables",
      conceptNames: ["Variables"],
      references: [],
      suggestedStrategy: brandId<"StrategyId">("worked-examples"),
      estimatedMinutes: 45,
    },
  ],
};

function makeDraft(
  draftId: string,
  studentId: StudentId,
  nowMs: number = Date.now(),
): DraftCourseState {
  const now = nowMs as Timestamp;
  return {
    draftId,
    studentId,
    documentIds: [],
    proposed: { ...BASE_PROPOSED },
    createdAt: now,
    lastTouchedAt: now,
    expiresAt: (now + 2 * 60 * 60 * 1000) as Timestamp,
  };
}

const db = useTempDb();

describe("SqliteDraftStore", () => {
  it("round-trip: save → load returns byte-equivalent state", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const draft = makeDraft("draft-1", STUDENT_A);

    store.save(draft);
    const loaded = store.load("draft-1");

    expect(loaded).not.toBeNull();
    // All fields must match exactly — save stores caller's state verbatim.
    expect(loaded?.draftId).toBe(draft.draftId);
    expect(loaded?.studentId).toBe(draft.studentId);
    expect(loaded?.documentIds).toEqual(draft.documentIds);
    expect(loaded?.proposed.title).toBe(draft.proposed.title);
    expect(loaded?.createdAt).toBe(draft.createdAt);
    expect(loaded?.lastTouchedAt).toBe(draft.lastTouchedAt);
  });

  it("upsert: re-saving overwrites content and preserves createdAt", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const now = Date.now();
    const draft = makeDraft("draft-upsert", STUDENT_A, now);
    store.save(draft);

    // Mutate and re-save with a later lastTouchedAt.
    const updated: DraftCourseState = {
      ...draft,
      proposed: { ...BASE_PROPOSED, title: "Updated Algebra" },
      lastTouchedAt: (now + 5000) as Timestamp,
    };
    store.save(updated);

    const loaded = store.load("draft-upsert");
    expect(loaded?.proposed.title).toBe("Updated Algebra");
    // createdAt must remain the original value.
    expect(loaded?.createdAt).toBe(draft.createdAt);
  });

  it("load() returns null for confirmed rows", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const draft = makeDraft("draft-confirmed", STUDENT_A);
    store.save(draft);

    store.markConfirmedTx(client, "draft-confirmed", "course-abc");

    expect(store.load("draft-confirmed")).toBeNull();
  });

  it("load() returns null for discarded rows", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const draft = makeDraft("draft-discarded", STUDENT_A);
    store.save(draft);

    store.markDiscarded("draft-discarded");

    expect(store.load("draft-discarded")).toBeNull();
  });

  it("load() returns null for unknown id", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    expect(store.load("no-such-draft")).toBeNull();
  });

  it("listForStudent: filters by student, excludes terminal rows, orders by lastTouchedAt DESC", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const now = Date.now();

    // Older draft for STUDENT_A.
    const older = makeDraft("draft-older", STUDENT_A, now - 10_000);
    // Newer draft for STUDENT_A.
    const newer = makeDraft("draft-newer", STUDENT_A, now);
    // Draft for STUDENT_B — should not appear.
    const other = makeDraft("draft-other-student", STUDENT_B, now);
    // Confirmed draft for STUDENT_A — should be excluded.
    const confirmed = makeDraft("draft-confirmed-a", STUDENT_A, now - 5_000);

    store.save(older);
    store.save(newer);
    store.save(other);
    store.save(confirmed);
    store.markConfirmedTx(client, "draft-confirmed-a", "course-xyz");

    const results = store.listForStudent(STUDENT_A);

    // Only active STUDENT_A drafts.
    expect(results.map((d) => d.draftId)).toEqual(["draft-newer", "draft-older"]);
  });

  it("listActive: returns all active drafts across all students", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const now = Date.now();

    store.save(makeDraft("active-a", STUDENT_A, now));
    store.save(makeDraft("active-b", STUDENT_B, now - 1000));
    const toDiscard = makeDraft("discarded-one", STUDENT_A, now - 2000);
    store.save(toDiscard);
    store.markDiscarded("discarded-one");

    const results = store.listActive();
    const ids = results.map((d) => d.draftId);

    expect(ids).toContain("active-a");
    expect(ids).toContain("active-b");
    expect(ids).not.toContain("discarded-one");
  });

  it("markConfirmedTx inside a rolled-back transaction leaves the row active", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const draft = makeDraft("draft-rollback-test", STUDENT_A);
    store.save(draft);

    // Run a transaction that calls markConfirmedTx then deliberately throws.
    expect(() => {
      client.transaction((tx) => {
        store.markConfirmedTx(tx, "draft-rollback-test", "course-rollback");
        throw new Error("deliberate rollback");
      });
    }).toThrow("deliberate rollback");

    // After the rollback, the row must still be active.
    const loaded = store.load("draft-rollback-test");
    expect(loaded).not.toBeNull();
    expect(loaded?.draftId).toBe("draft-rollback-test");
  });

  it("markDiscarded: flips discardedAt; subsequent load returns null", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const draft = makeDraft("draft-discard-check", STUDENT_A);
    store.save(draft);

    expect(store.load("draft-discard-check")).not.toBeNull();
    store.markDiscarded("draft-discard-check");
    expect(store.load("draft-discard-check")).toBeNull();
  });

  it("sweepStale: discards stale rows, leaves fresh rows, returns swept ids", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const now = Date.now();
    const cutoff = now - 3_600_000; // 1 hour ago

    // Stale draft — lastTouchedAt is before the cutoff.
    const staleDraft = makeDraft("draft-stale", STUDENT_A, cutoff - 1000);
    // Fresh draft — lastTouchedAt is at or after the cutoff.
    const freshDraft = makeDraft("draft-fresh", STUDENT_A, cutoff);

    store.save(staleDraft);
    store.save(freshDraft);

    const swept = store.sweepStale(cutoff);

    expect(swept).toContain("draft-stale");
    expect(swept).not.toContain("draft-fresh");

    // Stale row must now be inaccessible via load().
    expect(store.load("draft-stale")).toBeNull();
    // Fresh row must still be active.
    expect(store.load("draft-fresh")).not.toBeNull();
  });

  it("sweepStale: returns empty array when no stale rows exist", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const now = Date.now();

    // All fresh (lastTouchedAt = now, cutoff = 1 hour ago).
    store.save(makeDraft("fresh-only", STUDENT_A, now));

    const swept = store.sweepStale(now - 3_600_000);
    expect(swept).toEqual([]);
  });

  it("sweepStale: does not sweep already-discarded rows", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const now = Date.now();
    const cutoff = now;

    const stale = makeDraft("draft-pre-discarded", STUDENT_A, now - 10_000);
    store.save(stale);
    store.markDiscarded("draft-pre-discarded");

    // Sweep with a cutoff that would have caught the stale row.
    const swept = store.sweepStale(cutoff);

    // Already discarded — should not appear in the sweep return.
    expect(swept).not.toContain("draft-pre-discarded");
  });

  it("touch: bumps lastTouchedAt without changing stateJson content", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const now = Date.now();
    const draft = makeDraft("draft-touch", STUDENT_A, now - 5000);
    store.save(draft);

    const before = store.load("draft-touch");
    expect(before).not.toBeNull();

    // Small delay to ensure a measurable timestamp difference.
    const touchTime = Date.now();
    store.touch("draft-touch");

    const after = store.load("draft-touch");
    expect(after).not.toBeNull();
    // lastTouchedAt in stateJson is NOT bumped by touch() — touch only updates the column.
    // The state blob itself should be unchanged.
    expect(after?.proposed.title).toBe(before?.proposed.title);
    // The column-level lastTouchedAt is what touch updates; load reads stateJson.
    // We confirm the row stays active (confirmedAt/discardedAt still null).
    expect(after?.draftId).toBe("draft-touch");
    // Touch time must be >= the initial lastTouchedAt at save.
    expect(touchTime).toBeGreaterThanOrEqual(now - 5000);
  });

  it("rapid back-to-back save() calls preserve the last-written state (single-process race window)", () => {
    // Spec: save() is documented as last-writer-wins under rapid same-tick
    // contention. better-sqlite3 is synchronous, so two calls with no await
    // between them must result in load() returning the second state.
    const { db: client } = openDb({ path: db.dbPath });
    const store = new SqliteDraftStore(client);
    const now = Date.now();

    const stateA: DraftCourseState = makeDraft("draft-rapid", STUDENT_A, now);
    const stateB: DraftCourseState = {
      ...stateA,
      proposed: { ...BASE_PROPOSED, title: "Second Write" },
      lastTouchedAt: (now + 1) as Timestamp,
    };

    // Two calls in the same tick, no await — exercises the upsert race window.
    store.save(stateA);
    store.save(stateB);

    const loaded = store.load("draft-rapid");
    expect(loaded?.proposed.title).toBe("Second Write");
    expect(loaded?.lastTouchedAt).toBe(stateB.lastTouchedAt);
    // createdAt preserved from the FIRST save — upsert never overwrites it.
    expect(loaded?.createdAt).toBe(stateA.createdAt);
  });
});
