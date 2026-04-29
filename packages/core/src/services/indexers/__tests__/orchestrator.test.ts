/**
 * IndexerOrchestratorImpl unit tests.
 *
 * Uses a real temp DB to verify event reading; uses vi.useFakeTimers()
 * to control debounce timing without actually waiting.
 */
import { episodicEvents } from "@praxis/memory/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import type { Indexer, IndexerContext } from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import { IndexerOrchestratorImpl } from "../orchestrator.js";

const STUDENT_ID = brandId<"StudentId">("student-orch-test");
const SESSION_ID = brandId<"SessionId">("session-orch-test");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const dbCtx = useTempDb();

// Helper: insert a session + episodic event
function insertSessionAndEvent(
  db: ReturnType<typeof openDb>["db"],
  eventId: string,
  turnIndex: number,
): void {
  const { sessions } = require("@praxis/memory/schema") as typeof import("@praxis/memory/schema");
  // Upsert session (ignore if exists)
  try {
    db.insert(sessions)
      .values({
        id: SESSION_ID,
        studentId: STUDENT_ID,
        modeId: "teach",
        engineId: "direct.anthropic",
        startedAt: new Date(),
      })
      .run();
  } catch {
    // session already inserted
  }

  db.insert(episodicEvents)
    .values({
      id: eventId,
      sessionId: SESSION_ID,
      studentId: STUDENT_ID,
      ts: new Date(),
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex,
      eventJson: { type: "user_message", content: "test" },
    })
    .run();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── debounce collapse ────────────────────────────────────────────────────────

describe("IndexerOrchestratorImpl — debounce", () => {
  it("two scheduleAfterTurn calls within debounce window produce one indexer run", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertSessionAndEvent(db, "evt-deb-1", 0);

    const runCalls: number[] = [];
    const fakeIndexer: Indexer = {
      id: "fake-post",
      schedule: "post-turn",
      async run(_ctx: IndexerContext) {
        runCalls.push(Date.now());
      },
    };

    const orch = new IndexerOrchestratorImpl({
      db,
      log: MOCK_LOG,
      indexers: [fakeIndexer],
      debounceMs: 100,
    });

    orch.scheduleAfterTurn({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    vi.advanceTimersByTime(50);
    orch.scheduleAfterTurn({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    vi.advanceTimersByTime(50);
    // Second timer not yet fired (100ms debounce from second call)
    expect(runCalls).toHaveLength(0);
    expect(orch.pendingCount()).toBe(1);

    vi.advanceTimersByTime(100);
    await vi.runAllTimersAsync();

    expect(runCalls).toHaveLength(1);
    orch.shutdown();
  });

  it("two calls separated by 2x debounce produce two indexer runs", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    // Insert a turn-0 event for the first schedule call.
    insertSessionAndEvent(db, "evt-sep-1", 0);

    const runCalls: number[] = [];
    const fakeIndexer: Indexer = {
      id: "fake-post-2",
      schedule: "post-turn",
      async run(_ctx: IndexerContext) {
        runCalls.push(Date.now());
      },
    };

    const orch = new IndexerOrchestratorImpl({
      db,
      log: MOCK_LOG,
      indexers: [fakeIndexer],
      debounceMs: 100,
    });

    // First schedule: sees evt-sep-1 (turn 0), advances floor to 1.
    orch.scheduleAfterTurn({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();

    // Insert a new turn-1 event before the second schedule, simulating a new student turn.
    insertSessionAndEvent(db, "evt-sep-2", 1);

    // Second schedule: sees evt-sep-2 (turn 1, above floor 1) → second indexer run.
    orch.scheduleAfterTurn({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();

    expect(runCalls).toHaveLength(2);
    orch.shutdown();
  });
});

// ─── cancel ───────────────────────────────────────────────────────────────────

describe("IndexerOrchestratorImpl — cancel", () => {
  it("cancel clears pending timer; pendingCount() returns 0", () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    const orch = new IndexerOrchestratorImpl({
      db,
      log: MOCK_LOG,
      indexers: [],
      debounceMs: 1000,
    });

    orch.scheduleAfterTurn({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    expect(orch.pendingCount()).toBe(1);

    orch.cancel(SESSION_ID);
    expect(orch.pendingCount()).toBe(0);
    orch.shutdown();
  });
});

// ─── failure isolation ────────────────────────────────────────────────────────

describe("IndexerOrchestratorImpl — failure isolation", () => {
  it("a throwing indexer does not prevent other indexers from running", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertSessionAndEvent(db, "evt-iso-1", 0);

    let goodRan = false;
    const throwingIndexer: Indexer = {
      id: "thrower",
      schedule: "session-end",
      async run(_ctx) {
        throw new Error("intentional failure");
      },
    };
    const goodIndexer: Indexer = {
      id: "good",
      schedule: "session-end",
      async run(_ctx) {
        goodRan = true;
      },
    };

    const orch = new IndexerOrchestratorImpl({
      db,
      log: MOCK_LOG,
      indexers: [throwingIndexer, goodIndexer],
    });

    await orch.runAtSessionEnd({ studentId: STUDENT_ID, sessionId: SESSION_ID });

    expect(goodRan).toBe(true);
    expect(MOCK_LOG.warn).toHaveBeenCalledWith(
      expect.stringContaining("thrower.failed"),
      expect.anything(),
    );
    orch.shutdown();
  });
});

// ─── runAtSessionEnd ──────────────────────────────────────────────────────────

describe("IndexerOrchestratorImpl — runAtSessionEnd", () => {
  it("runs both session-end and post-turn indexers", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertSessionAndEvent(db, "evt-end-1", 0);

    const ran: string[] = [];
    const sessionEndIndexer: Indexer = {
      id: "session-end-idx",
      schedule: "session-end",
      async run(_ctx) {
        ran.push("session-end");
      },
    };
    const postTurnIndexer: Indexer = {
      id: "post-turn-idx",
      schedule: "post-turn",
      async run(_ctx) {
        ran.push("post-turn");
      },
    };

    const orch = new IndexerOrchestratorImpl({
      db,
      log: MOCK_LOG,
      indexers: [sessionEndIndexer, postTurnIndexer],
    });

    await orch.runAtSessionEnd({ studentId: STUDENT_ID, sessionId: SESSION_ID });

    expect(ran).toContain("session-end");
    expect(ran).toContain("post-turn");
    orch.shutdown();
  });
});

// ─── turnFloor ────────────────────────────────────────────────────────────────

describe("IndexerOrchestratorImpl — turnFloor increments", () => {
  it("subsequent post-turn runs only see events from lastTurn+1 onwards", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertSessionAndEvent(db, "evt-floor-1", 0);

    const seenEvents: string[][] = [];
    const trackingIndexer: Indexer = {
      id: "tracker",
      schedule: "post-turn",
      async run(ctx) {
        seenEvents.push(ctx.events.map((e) => e.id));
      },
    };

    const orch = new IndexerOrchestratorImpl({
      db,
      log: MOCK_LOG,
      indexers: [trackingIndexer],
      debounceMs: 100,
    });

    // First run — sees turn 0
    orch.scheduleAfterTurn({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();
    expect(seenEvents[0]).toContain("evt-floor-1");

    // Insert a turn-1 event
    insertSessionAndEvent(db, "evt-floor-2", 1);

    // Second run — floor is 1, should only see evt-floor-2
    orch.scheduleAfterTurn({ studentId: STUDENT_ID, sessionId: SESSION_ID });
    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();

    expect(seenEvents[1]).toContain("evt-floor-2");
    expect(seenEvents[1]).not.toContain("evt-floor-1");
    orch.shutdown();
  });
});
