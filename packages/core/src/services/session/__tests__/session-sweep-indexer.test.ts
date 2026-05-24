/**
 * Unit tests for SessionSweepIndexer.
 *
 * Covers:
 * - Discards registry entries older than idleMs
 * - Does NOT discard entries newer than idleMs
 * - Orphan-tab cleanup: deletes tabs whose session_id is not in `sessions`
 *   and not in the registry
 * - Leaves tabs whose session_id is in `sessions` alone
 * - Leaves tabs whose session_id is currently in the registry alone
 */

import { sessions, tabs } from "@praxis/memory/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { noopLogger } from "../../../../../../tests/helpers/mocks.js";
import { openDb } from "../../../db/index.js";
import type { AssignmentId, CourseId, SessionId, StudentId, Timestamp } from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import type { UnpromotedSessionState } from "../session-promotion-registry.js";
import { SessionPromotionRegistryImpl } from "../session-promotion-registry.js";
import { SessionSweepIndexer } from "../session-sweep-indexer.js";

const dbCtx = useTempDb();

function openTestDb() {
  return openDb({ path: dbCtx.dbPath }).db;
}

function makeState(
  sessionId: SessionId,
  startedAt: Timestamp,
  studentId: StudentId = brandId<"StudentId">("student-1"),
): UnpromotedSessionState {
  return {
    sessionId,
    studentId,
    modeId: "teach",
    engineId: "fake-engine",
    startedAt,
  };
}

function makeRegistry(db: ReturnType<typeof openTestDb>) {
  const fakeEngineManager = {
    close: vi.fn().mockResolvedValue(undefined),
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
  } as any;
  return new SessionPromotionRegistryImpl({
    db,
    log: noopLogger(),
    engineSessionManager: () => fakeEngineManager,
  });
}

function makeSweep(
  db: ReturnType<typeof openTestDb>,
  registry: SessionPromotionRegistryImpl,
  idleMs: number,
) {
  return new SessionSweepIndexer({
    registry,
    db,
    log: noopLogger(),
    config: () => ({ cadenceMs: 10 * 60 * 1000, idleMs }),
  });
}

function insertTab(
  db: ReturnType<typeof openTestDb>,
  tabId: string,
  sessionId: string | null,
  studentId = "student-1",
) {
  db.insert(tabs)
    .values({
      id: tabId,
      studentId,
      kind: "session",
      sessionId,
      title: "test tab",
      sortOrder: 0,
      openedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .run();
}

function insertSession(db: ReturnType<typeof openTestDb>, sessionId: string) {
  db.insert(sessions)
    .values({
      id: sessionId,
      studentId: "student-1",
      modeId: "teach",
      engineId: "fake-engine",
      startedAt: new Date(),
    })
    .run();
}

describe("SessionSweepIndexer.run", () => {
  let db: ReturnType<typeof openTestDb>;

  beforeEach(() => {
    db = openTestDb();
  });

  it("discards registry entries older than idleMs", async () => {
    const registry = makeRegistry(db);
    const idleMs = 30 * 60 * 1000;
    const oldTs = (Date.now() - idleMs - 1000) as Timestamp; // 1s past threshold
    const sid = brandId<"SessionId">("session-old");
    registry.register(makeState(sid, oldTs));

    const sweep = makeSweep(db, registry, idleMs);
    await sweep.run();

    expect(registry.get(sid)).toBeNull();
  });

  it("does NOT discard entries newer than idleMs", async () => {
    const registry = makeRegistry(db);
    const idleMs = 30 * 60 * 1000;
    const newTs = (Date.now() - 1000) as Timestamp; // 1s old — well under threshold
    const sid = brandId<"SessionId">("session-new");
    registry.register(makeState(sid, newTs));

    const sweep = makeSweep(db, registry, idleMs);
    await sweep.run();

    expect(registry.get(sid)).not.toBeNull();
  });

  it("deletes orphan tabs (no sessions row, not in registry)", async () => {
    const registry = makeRegistry(db);
    const orphanTabId = "tab-orphan";
    insertTab(db, orphanTabId, "ghost-session-id");

    const sweep = makeSweep(db, registry, 30 * 60 * 1000);
    await sweep.run();

    const remaining = db.select().from(tabs).all();
    expect(remaining.find((t) => t.id === orphanTabId)).toBeUndefined();
  });

  it("preserves tabs whose session_id is in the sessions table", async () => {
    const registry = makeRegistry(db);
    const sessionId = "real-session";
    insertSession(db, sessionId);
    insertTab(db, "tab-real", sessionId);

    const sweep = makeSweep(db, registry, 30 * 60 * 1000);
    await sweep.run();

    const remaining = db.select().from(tabs).all();
    expect(remaining.find((t) => t.id === "tab-real")).toBeDefined();
  });

  it("preserves tabs whose session_id is in the registry (not yet promoted)", async () => {
    const registry = makeRegistry(db);
    const sid = brandId<"SessionId">("session-registry");
    const newTs = (Date.now() - 1000) as Timestamp;
    registry.register(makeState(sid, newTs));
    insertTab(db, "tab-registry", sid);

    const sweep = makeSweep(db, registry, 30 * 60 * 1000);
    await sweep.run();

    const remaining = db.select().from(tabs).all();
    expect(remaining.find((t) => t.id === "tab-registry")).toBeDefined();
  });

  it("handles empty registry + no orphan tabs gracefully", async () => {
    const registry = makeRegistry(db);
    const sweep = makeSweep(db, registry, 30 * 60 * 1000);
    await expect(sweep.run()).resolves.toBeUndefined();
  });

  it("start/stop does not throw", () => {
    const registry = makeRegistry(db);
    const sweep = makeSweep(db, registry, 30 * 60 * 1000);
    sweep.start();
    sweep.stop();
    // Calling stop() twice is safe too.
    sweep.stop();
  });
});
