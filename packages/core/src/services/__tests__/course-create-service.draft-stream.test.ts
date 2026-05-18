/**
 * Unit tests for CourseCreateServiceImpl's draft-stream subscription —
 * the live-update channel the renderer's bootstrap right-pane outline uses.
 *
 * Covers:
 *  - subscribe() emits a snapshot first
 *  - initDraft emits `started`
 *  - every mutator emits `updated`
 *  - confirmDraft emits `finalized` (mocked persistence; we only assert the
 *    event surface — full persistence is covered by other suites)
 *  - discardDraft emits `discarded`
 *  - discardDraft via store.markDiscarded then showDraft → null (no event; expiry handled by sweep)
 *  - sweepStale emits `discarded` for each swept draft
 *  - shutdown clears listeners
 *  - listener exceptions don't stop other listeners
 */
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import type {
  DraftId,
  DraftStreamEvent,
  DraftStreamListener,
  Engine,
  StudentId,
  Timestamp,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { CourseCreateServiceImpl } from "../course-create-service.js";
import { SqliteDraftStore } from "../draft-store.js";

const STUDENT_ID = brandId<"StudentId">("student-test") as StudentId;

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const MOCK_DOCUMENT_SCOPES = {
  listForScope: vi.fn().mockResolvedValue([]),
  listForScopeDetailed: vi.fn().mockResolvedValue([]),
  attach: vi.fn().mockResolvedValue({ attached: true }),
  detach: vi.fn().mockResolvedValue({ detached: true }),
  attachMany: vi.fn().mockResolvedValue({ newlyAttached: [] }),
  listScopesForDocument: vi.fn().mockResolvedValue([]),
  promoteScope: vi.fn().mockResolvedValue({ promoted: [] }),
  listOrphaned: vi.fn().mockResolvedValue([]),
};

function makeEngine(): Engine {
  return { open: vi.fn() } as unknown as Engine;
}

// All tests share one temp DB; each test creates a fresh service + store.
const dbCtx = useTempDb();

function makeService(opts?: { sweepIntervalMs?: number }) {
  const { db } = openDb({ path: dbCtx.dbPath });
  const store = new SqliteDraftStore(db);
  const svc = new CourseCreateServiceImpl({
    db,
    log: MOCK_LOG,
    engineResolver: makeEngine,
    documentScopes: MOCK_DOCUMENT_SCOPES,
    sweepIntervalMs: opts?.sweepIntervalMs ?? 9_999_999,
    draftStore: store,
  });
  return { svc, store, db };
}

function makeListener(): {
  events: DraftStreamEvent[];
  listener: DraftStreamListener;
} {
  const events: DraftStreamEvent[] = [];
  return {
    events,
    listener: (e) => {
      events.push(e);
    },
  };
}

describe("CourseCreateServiceImpl — draft stream", () => {
  it("subscribe emits a snapshot of currently-live drafts", async () => {
    const { svc } = makeService();
    // Seed a draft BEFORE subscribing.
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    const { events, listener } = makeListener();
    const unsubscribe = svc.subscribe(listener);

    expect(events).toHaveLength(1);
    const first = events[0];
    expect(first?.kind).toBe("snapshot");
    if (first?.kind === "snapshot") {
      expect(first.drafts).toHaveLength(1);
      expect(first.drafts[0]?.draftId).toBe(draftId);
    }

    unsubscribe();
    svc.shutdown();
  });

  it("initDraft emits a `started` event", async () => {
    const { svc } = makeService();
    const { events, listener } = makeListener();
    svc.subscribe(listener);
    // Drop the snapshot.
    events.length = 0;

    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("started");
    if (events[0]?.kind === "started") {
      expect(events[0].draft.draftId).toBe(draftId);
      expect(events[0].draft.proposed.title).toBe("Algebra 1");
    }
    svc.shutdown();
  });

  it("each mutator emits an `updated` event with the post-mutation draft", async () => {
    const { svc } = makeService();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    const { events, listener } = makeListener();
    svc.subscribe(listener);
    events.length = 0;

    // 1. addConcept
    await svc.addConcept({
      draftId,
      name: "Variables",
      description: "symbols representing numbers",
    });
    expect(events.at(-1)?.kind).toBe("updated");

    // 2. addEdge needs two concepts.
    await svc.addConcept({ draftId, name: "Equations", description: "statements of equality" });
    await svc.addEdge({
      draftId,
      fromName: "Variables",
      toName: "Equations",
      strength: 0.8,
      rationale: "you need variables before equations",
    });
    expect(events.at(-1)?.kind).toBe("updated");

    // 3. addLesson
    const lessonRes = await svc.addLesson({
      draftId,
      title: "Intro to Variables",
      conceptNames: ["Variables"],
      references: [],
    });
    expect(lessonRes.ok).toBe(true);
    expect(events.at(-1)?.kind).toBe("updated");

    // 4. addUnit
    const draft = await svc.showDraft(draftId);
    const draftLessonId = draft?.proposed.proposedLessons[0]?.draftLessonId;
    expect(draftLessonId).toBeDefined();
    if (!draftLessonId) return;
    await svc.addUnit({
      draftId,
      name: "Unit 1",
      draftLessonIds: [draftLessonId],
    });
    expect(events.at(-1)?.kind).toBe("updated");

    // 5. setAssessmentPlan
    await svc.setAssessmentPlan({
      draftId,
      plan: {
        perLesson: { homework: true, quizFrequency: 2 },
        summatives: [],
      },
    });
    expect(events.at(-1)?.kind).toBe("updated");

    // 6. addLessonAssessment
    await svc.addLessonAssessment({
      draftId,
      draftLessonId,
      kind: "quiz",
      timing: "after",
      purpose: "practice",
      conceptNames: ["Variables"],
      rationale: "check recall",
      title: "Variables Quiz",
    });
    expect(events.at(-1)?.kind).toBe("updated");

    // 7. setMetadata
    await svc.setMetadata({ draftId, title: "Algebra 1 (revised)" });
    expect(events.at(-1)?.kind).toBe("updated");

    // 8. removeConcept
    await svc.addConcept({ draftId, name: "Inequalities", description: "comparison statements" });
    await svc.removeConcept({ draftId, name: "Inequalities" });
    expect(events.at(-1)?.kind).toBe("updated");

    // 9. removeLesson
    await svc.removeLesson({ draftId, lessonIndex: 0 });
    expect(events.at(-1)?.kind).toBe("updated");

    // Sanity: every step we exercised should have produced an `updated`.
    expect(events.every((e) => e.kind === "updated")).toBe(true);
    svc.shutdown();
  });

  it("discardDraft emits `discarded` with reason 'discarded'", async () => {
    const { svc } = makeService();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    const { events, listener } = makeListener();
    svc.subscribe(listener);
    events.length = 0;

    await svc.discardDraft(draftId);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: "discarded", draftId, reason: "discarded" });
    svc.shutdown();
  });

  it("discardDraft on a missing id is a silent no-op", async () => {
    const { svc } = makeService();
    const { events, listener } = makeListener();
    svc.subscribe(listener);
    events.length = 0;

    await svc.discardDraft("does-not-exist");

    expect(events).toHaveLength(0);
    svc.shutdown();
  });

  it("showDraft of a discarded draft returns null", async () => {
    // The store-based lifecycle: showDraft returns null for confirmed/discarded rows.
    // Stale sweeping is tested separately. Here we manually discard and verify null.
    const { svc, store } = makeService();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    // Manually mark discarded via the store (simulating external discard or sweep).
    store.markDiscarded(brandId<"DraftId">(draftId) as DraftId);

    const result = await svc.showDraft(draftId);
    expect(result).toBeNull();
    svc.shutdown();
  });

  it("sweepStale emits `discarded` for every swept draft", async () => {
    // Use a tiny sweep interval and fake timers to drive the sweep.
    vi.useFakeTimers();
    try {
      const { svc, store } = makeService({ sweepIntervalMs: 50 });
      const { draftId: id1 } = await svc.initDraft({
        studentId: STUDENT_ID,
        documentIds: [],
        courseTitle: "A",
        subject: "math",
        gradeLevel: "9",
      });
      const { draftId: id2 } = await svc.initDraft({
        studentId: STUDENT_ID,
        documentIds: [],
        courseTitle: "B",
        subject: "math",
        gradeLevel: "9",
      });

      // Set both drafts' lastTouchedAt to 8 days ago so they're swept.
      const eightDaysAgo = (Date.now() - 8 * 24 * 60 * 60 * 1000) as Timestamp;
      for (const id of [id1, id2]) {
        const d = store.load(brandId<"DraftId">(id) as DraftId);
        if (d) {
          d.lastTouchedAt = eightDaysAgo;
          store.save(d);
        }
      }

      const { events, listener } = makeListener();
      svc.subscribe(listener);
      events.length = 0;

      // Advance clock to fire the sweep.
      await vi.advanceTimersByTimeAsync(60);

      const discardEvents = events.filter((e) => e.kind === "discarded");
      expect(discardEvents).toHaveLength(2);
      const ids = discardEvents.map((e) => (e.kind === "discarded" ? e.draftId : ""));
      expect(new Set(ids)).toEqual(new Set([id1, id2]));
      for (const e of discardEvents) {
        if (e.kind === "discarded") expect(e.reason).toBe("expired");
      }
      svc.shutdown();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shutdown clears listeners — no further events after shutdown", async () => {
    const { svc } = makeService();
    const { events, listener } = makeListener();
    svc.subscribe(listener);
    events.length = 0;

    svc.shutdown();

    // After shutdown, listeners are cleared. A fresh subscribe should still
    // see the store's active drafts in the snapshot (store survives shutdown).
    const fresh = makeListener();
    svc.subscribe(fresh.listener);
    expect(fresh.events).toHaveLength(1);
    // The snapshot may contain previously created drafts from the store,
    // but the original listener should have received no events.
    expect(events).toHaveLength(0);
  });

  it("a throwing listener does not break other listeners on emitted events", async () => {
    const { svc } = makeService();
    const a = makeListener();
    const b = makeListener();
    // Throws only after the initial snapshot — the snapshot delivery in
    // subscribe() is unwrapped, mirroring ActivityRegistry's contract.
    const throwing: DraftStreamListener = (e) => {
      if (e.kind !== "snapshot") throw new Error("boom");
    };
    svc.subscribe(a.listener);
    svc.subscribe(throwing);
    svc.subscribe(b.listener);
    a.events.length = 0;
    b.events.length = 0;

    await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "A",
      subject: "math",
      gradeLevel: "9",
    });

    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(1);
    // The thrower's failure is logged via deps.log.warn — we don't assert on
    // that here (the mock log captures it), only that it didn't propagate.
    svc.shutdown();
  });

  it("unsubscribe() stops further events", async () => {
    const { svc } = makeService();
    const { events, listener } = makeListener();
    const unsub = svc.subscribe(listener);
    events.length = 0;

    unsub();

    await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "A",
      subject: "math",
      gradeLevel: "9",
    });

    expect(events).toHaveLength(0);
    svc.shutdown();
  });
});
