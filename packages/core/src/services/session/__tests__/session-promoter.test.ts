/**
 * Unit tests for SessionPromoter.
 *
 * Covers:
 * - shouldPromote() returns true when session is in the registry.
 * - shouldPromote() returns false when session is not in the registry.
 * - promote() runs the DB transaction (session row + episodic event written).
 * - promote() removes the session from the registry after the transaction.
 * - promote() returns the PromotionResult with correct fields.
 * - promote() with courseId and assignmentId passes them through.
 * - promote() throws if the session is not registered (SessionNotRegisteredError).
 */

import { episodicEvents, sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { noopLogger } from "../../../../../../tests/helpers/mocks.js";
import { openDb } from "../../../db/index.js";
import type { AssignmentId, CourseId, SessionId, StudentId, Timestamp } from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import {
  SessionNotRegisteredError,
  SessionPromotionRegistryImpl,
  type UnpromotedSessionState,
} from "../session-promotion-registry.js";
import { SessionPromoter } from "../session-promoter.js";

// ── test helpers ──────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

function openTestDb() {
  return openDb({ path: dbCtx.dbPath }).db;
}

type TestDb = ReturnType<typeof openTestDb>;

function makeState(overrides: Partial<UnpromotedSessionState> = {}): UnpromotedSessionState {
  return {
    sessionId: brandId<"SessionId">("session-promoter-test"),
    studentId: brandId<"StudentId">("student-promoter-test"),
    modeId: "teach",
    engineId: "direct.anthropic",
    startedAt: Date.now() as Timestamp,
    ...overrides,
  };
}

function makePromoter(db: TestDb, overrides: Partial<UnpromotedSessionState> = {}) {
  const log = noopLogger();
  const registry = new SessionPromotionRegistryImpl({
    db,
    log,
    engineSessionManager: () =>
      ({
        close: vi.fn().mockResolvedValue(undefined),
        // biome-ignore lint/suspicious/noExplicitAny: minimal mock; only close() is exercised by the promotion path under test
      }) as any,
  });

  const persistSessionRow = vi.fn((state: UnpromotedSessionState) => {
    db.insert(sessions)
      .values({
        id: state.sessionId,
        studentId: state.studentId,
        modeId: state.modeId,
        engineId: state.engineId,
        startedAt: new Date(state.startedAt),
        ...(state.courseId !== undefined && { courseId: state.courseId }),
        ...(state.assignmentId !== undefined && { assignmentId: state.assignmentId }),
      })
      .run();
  });

  const promoter = new SessionPromoter({ db, log, registry, persistSessionRow });

  return { promoter, registry, persistSessionRow };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionPromoter", () => {
  let db: TestDb;

  beforeEach(() => {
    db = openTestDb();
  });

  describe("shouldPromote()", () => {
    it("returns true when the session is registered", () => {
      const { promoter, registry } = makePromoter(db);
      const state = makeState();
      registry.register(state);

      expect(promoter.shouldPromote(state.sessionId)).toBe(true);
    });

    it("returns false when the session is not registered", () => {
      const { promoter } = makePromoter(db);
      const unknownId = brandId<"SessionId">("not-registered");

      expect(promoter.shouldPromote(unknownId)).toBe(false);
    });

    it("returns false after the session has been promoted", () => {
      const { promoter, registry } = makePromoter(db);
      const state = makeState();
      registry.register(state);

      promoter.promote(state.sessionId, "hello");

      expect(promoter.shouldPromote(state.sessionId)).toBe(false);
    });
  });

  describe("promote()", () => {
    it("inserts the session row into the sessions table", () => {
      const { promoter, registry } = makePromoter(db);
      const state = makeState();
      registry.register(state);

      promoter.promote(state.sessionId, "first message");

      const row = db.select().from(sessions).where(eq(sessions.id, state.sessionId)).get();
      expect(row).toBeDefined();
      expect(row?.modeId).toBe("teach");
      expect(row?.studentId).toBe(state.studentId);
      expect(row?.engineId).toBe("direct.anthropic");
    });

    it("records a user_message episodic event at turnIndex 0", () => {
      const { promoter, registry } = makePromoter(db);
      const state = makeState();
      registry.register(state);

      promoter.promote(state.sessionId, "first message");

      const events = db
        .select()
        .from(episodicEvents)
        .where(eq(episodicEvents.sessionId, state.sessionId))
        .all();

      expect(events).toHaveLength(1);
      const evt = events[0];
      expect(evt?.turnIndex).toBe(0);
      // biome-ignore lint/suspicious/noExplicitAny: eventJson is EngineEvent stored as JSON
      const eventJson = evt?.eventJson as any;
      expect(eventJson?.type).toBe("user_message");
      expect(eventJson?.content).toBe("first message");
    });

    it("removes the session from the registry after successful promotion", () => {
      const { promoter, registry } = makePromoter(db);
      const state = makeState();
      registry.register(state);

      promoter.promote(state.sessionId, "hello");

      expect(registry.get(state.sessionId)).toBeNull();
    });

    it("returns a PromotionResult with the correct basic fields", () => {
      const { promoter, registry } = makePromoter(db);
      const state = makeState();
      registry.register(state);

      const result = promoter.promote(state.sessionId, "hello");

      expect(result.studentId).toBe(state.studentId);
      expect(result.modeId).toBe("teach");
      expect(result.engineId).toBe("direct.anthropic");
      expect(result.courseId).toBeUndefined();
      expect(result.assignmentId).toBeUndefined();
    });

    it("includes courseId and assignmentId in the PromotionResult when present", () => {
      const { promoter, registry } = makePromoter(db);
      const courseId = brandId<"CourseId">("course-abc");
      const assignmentId = brandId<"AssignmentId">("assignment-xyz");
      const state = makeState({ courseId, assignmentId });
      registry.register(state);

      const result = promoter.promote(state.sessionId, "hello");

      expect(result.courseId).toBe(courseId);
      expect(result.assignmentId).toBe(assignmentId);
    });

    it("throws SessionNotRegisteredError when the session is not registered", () => {
      const { promoter } = makePromoter(db);
      const unknownId = brandId<"SessionId">("not-registered");

      expect(() => promoter.promote(unknownId, "hello")).toThrow(SessionNotRegisteredError);
    });

    it("calls persistSessionRow exactly once with the registered state", () => {
      const { promoter, registry, persistSessionRow } = makePromoter(db);
      const state = makeState();
      registry.register(state);

      promoter.promote(state.sessionId, "hello");

      expect(persistSessionRow).toHaveBeenCalledTimes(1);
      expect(persistSessionRow).toHaveBeenCalledWith(state);
    });
  });
});
