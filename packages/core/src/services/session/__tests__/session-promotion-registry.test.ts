/**
 * Unit tests for SessionPromotionRegistryImpl.
 *
 * Covers: register/get, promote (success + not-registered error), discard
 * (idempotency, engine close, tab delete), entries(), and the best-effort
 * error-tolerance of discard().
 */

import { tabs } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { noopLogger, recordingLogger } from "../../../../../../tests/helpers/mocks.js";
import { openDb } from "../../../db/index.js";
import type { AssignmentId, CourseId, StudentId, Timestamp } from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import type { EngineSessionManager } from "../engine-session-manager.js";
import {
  SessionNotRegisteredError,
  SessionPromotionRegistryImpl,
  type UnpromotedSessionState,
} from "../session-promotion-registry.js";

// ── test helpers ──────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

/** Open a fresh Drizzle client against the per-test temp DB. */
function openTestDb() {
  return openDb({ path: dbCtx.dbPath }).db;
}

function makeState(overrides: Partial<UnpromotedSessionState> = {}): UnpromotedSessionState {
  return {
    sessionId: brandId<"SessionId">("session-abc"),
    studentId: brandId<"StudentId">("student-xyz"),
    modeId: "teach",
    engineId: "claude-code",
    startedAt: Date.now() as Timestamp,
    ...overrides,
  };
}

function makeFakeEngineManager(
  overrides: { close?: EngineSessionManager["close"] } = {},
): EngineSessionManager {
  return {
    close: overrides.close ?? vi.fn().mockResolvedValue(undefined),
    // biome-ignore lint/suspicious/noExplicitAny: partial stub — only close() is exercised here
  } as any as EngineSessionManager;
}

function makeRegistry(
  db: ReturnType<typeof openDb>["db"],
  engineManager: EngineSessionManager,
  log = noopLogger(),
) {
  return new SessionPromotionRegistryImpl({
    db,
    log,
    engineSessionManager: () => engineManager,
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("SessionPromotionRegistryImpl.register + get", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    db = openTestDb();
  });

  it("returns null for an unknown sessionId", () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    expect(registry.get(brandId<"SessionId">("unknown"))).toBeNull();
  });

  it("register then get returns the same state structure", () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    const state = makeState();
    registry.register(state);
    expect(registry.get(state.sessionId)).toEqual(state);
  });

  it("register overwrites an existing entry with the same sessionId", () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    const sessionId = brandId<"SessionId">("session-dup");
    const first = makeState({ sessionId, modeId: "teach" });
    const second = makeState({ sessionId, modeId: "quiz" });
    registry.register(first);
    registry.register(second);
    expect(registry.get(sessionId)?.modeId).toBe("quiz");
  });

  it("preserves optional courseId and assignmentId", () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    const state = makeState({
      courseId: brandId<"CourseId">("course-1") as CourseId,
      assignmentId: brandId<"AssignmentId">("assign-1") as AssignmentId,
    });
    registry.register(state);
    const got = registry.get(state.sessionId);
    expect(got?.courseId).toBe(state.courseId);
    expect(got?.assignmentId).toBe(state.assignmentId);
  });
});

describe("SessionPromotionRegistryImpl.promote", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    db = openTestDb();
  });

  it("returns the txFn return value and removes the entry", () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    const state = makeState();
    registry.register(state);

    const result = registry.promote(state.sessionId, (s) => `promoted:${s.modeId}`);

    expect(result).toBe("promoted:teach");
    // Entry removed — subsequent get returns null.
    expect(registry.get(state.sessionId)).toBeNull();
  });

  it("txFn receives the correct state", () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    const state = makeState({ modeId: "quiz", engineId: "codex" });
    registry.register(state);

    const captured: UnpromotedSessionState[] = [];
    registry.promote(state.sessionId, (s) => {
      captured.push(s);
    });

    expect(captured[0]?.modeId).toBe("quiz");
    expect(captured[0]?.engineId).toBe("codex");
  });

  it("throws SessionNotRegisteredError for an unregistered sessionId", () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    const sessionId = brandId<"SessionId">("no-such-session");

    expect(() => registry.promote(sessionId, () => {})).toThrow(SessionNotRegisteredError);
  });

  it("does not remove entry when txFn throws", () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    const state = makeState();
    registry.register(state);

    expect(() =>
      registry.promote(state.sessionId, () => {
        throw new Error("tx failed");
      }),
    ).toThrow("tx failed");

    // Entry must still be present — txFn threw before the map.delete.
    expect(registry.get(state.sessionId)).not.toBeNull();
  });
});

describe("SessionPromotionRegistryImpl.discard", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: StudentId;

  beforeEach(() => {
    db = openTestDb();
    studentId = brandId<"StudentId">("student-discard");
  });

  it("is idempotent — calling twice does not throw", async () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    const state = makeState();
    registry.register(state);

    await registry.discard(state.sessionId);
    await expect(registry.discard(state.sessionId)).resolves.toBeUndefined();
  });

  it("is a no-op for a session that was never registered", async () => {
    const closeSpy = vi.fn().mockResolvedValue(undefined);
    const registry = makeRegistry(db, makeFakeEngineManager({ close: closeSpy }));
    await registry.discard(brandId<"SessionId">("ghost-session"));
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("calls engineSessionManager.close with the correct sessionId", async () => {
    const closeSpy = vi.fn().mockResolvedValue(undefined);
    const registry = makeRegistry(db, makeFakeEngineManager({ close: closeSpy }));
    const sessionId = brandId<"SessionId">("session-close-test");
    registry.register(makeState({ sessionId }));

    await registry.discard(sessionId);

    expect(closeSpy).toHaveBeenCalledWith(sessionId);
  });

  it("deletes tab rows matching session_id from the DB", async () => {
    const sessionId = brandId<"SessionId">("session-tab-del");

    // Insert a tab row that references this unpromoted session.
    db.insert(tabs)
      .values({
        id: "tab-1",
        studentId,
        kind: "session",
        sessionId,
        title: "test tab",
        sortOrder: 0,
        openedAt: new Date(),
        lastSeenAt: new Date(),
      })
      .run();

    const registry = makeRegistry(db, makeFakeEngineManager());
    registry.register(makeState({ sessionId, studentId }));

    await registry.discard(sessionId);

    const remaining = db.select().from(tabs).where(eq(tabs.sessionId, sessionId)).all();
    expect(remaining).toHaveLength(0);
  });

  it("removes the entry from the map after discard", async () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    const state = makeState();
    registry.register(state);

    await registry.discard(state.sessionId);

    expect(registry.get(state.sessionId)).toBeNull();
  });

  it("continues cleanup when engine close fails", async () => {
    const sessionId = brandId<"SessionId">("session-close-err");

    // Insert a tab row so we can verify deletion still runs.
    db.insert(tabs)
      .values({
        id: "tab-close-err",
        studentId,
        kind: "session",
        sessionId,
        title: "test",
        sortOrder: 0,
        openedAt: new Date(),
        lastSeenAt: new Date(),
      })
      .run();

    const failingClose = vi.fn().mockRejectedValue(new Error("engine gone"));
    const log = recordingLogger();
    const registry = makeRegistry(db, makeFakeEngineManager({ close: failingClose }), log);
    registry.register(makeState({ sessionId, studentId }));

    // Should not throw even though close() rejects.
    await expect(registry.discard(sessionId)).resolves.toBeUndefined();

    // Tab should still have been deleted.
    const remaining = db.select().from(tabs).where(eq(tabs.sessionId, sessionId)).all();
    expect(remaining).toHaveLength(0);

    // Entry removed from map.
    expect(registry.get(sessionId)).toBeNull();

    // Warning emitted.
    const warnRecord = log.records.find(
      (r) => r.level === "warn" && r.message.includes("engine_close_failed"),
    );
    expect(warnRecord).toBeDefined();
  });
});

describe("SessionPromotionRegistryImpl.entries", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    db = openTestDb();
  });

  it("returns only registered-but-not-yet-promoted-or-discarded sessions", async () => {
    const registry = makeRegistry(db, makeFakeEngineManager());

    const s1 = makeState({ sessionId: brandId<"SessionId">("e1") });
    const s2 = makeState({ sessionId: brandId<"SessionId">("e2") });
    const s3 = makeState({ sessionId: brandId<"SessionId">("e3") });

    registry.register(s1);
    registry.register(s2);
    registry.register(s3);

    // Promote s1.
    registry.promote(s1.sessionId, () => {});
    // Discard s2.
    await registry.discard(s2.sessionId);

    const remaining = [...registry.entries()].map(([id]) => id);
    expect(remaining).toEqual([s3.sessionId]);
  });

  it("returns an empty iterator when the registry is empty", () => {
    const registry = makeRegistry(db, makeFakeEngineManager());
    expect([...registry.entries()]).toHaveLength(0);
  });
});
