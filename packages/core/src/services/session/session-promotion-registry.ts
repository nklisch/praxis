/**
 * SessionPromotionRegistry — in-memory map of sessions that have been
 * opened (tab row written, engine session opened) but NOT yet persisted to
 * the `sessions` table.
 *
 * The registry is the single source of truth consulted by:
 *   - SessionService: `promote()` on the first user message (lazy-persist).
 *   - TabsService sweep: `discard()` for orphan tabs whose session was never
 *     promoted (empty-session cleanup).
 *
 * Pattern preserved: lazy-resolver-thunk (engineSessionManager injected as
 * `() => EngineSessionManager` to defer construction-order coupling).
 */

import { tabs } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type {
  AssignmentId,
  CourseId,
  Logger,
  SessionId,
  StudentId,
  Timestamp,
} from "../../types/index.js";
import type { EngineSessionManager } from "./engine-session-manager.js";

export interface UnpromotedSessionState {
  sessionId: SessionId;
  studentId: StudentId;
  modeId: string;
  engineId: string;
  courseId?: CourseId;
  assignmentId?: AssignmentId;
  startedAt: Timestamp;
}

export interface SessionPromotionRegistry {
  /**
   * Record an unpromoted session. Idempotent — registering the same sessionId
   * twice overwrites the existing entry.
   */
  register(state: UnpromotedSessionState): void;

  /**
   * Return the registered state, or null if the session has already been
   * promoted, discarded, or never registered.
   */
  get(sessionId: SessionId): UnpromotedSessionState | null;

  /**
   * Run `txFn` with the registered state, returning its result. Removes the
   * session from the registry after `txFn` returns successfully.
   *
   * `txFn` is expected to run inside a caller-managed SQLite transaction that
   * persists the session row. The registry removal is the commit-side effect.
   *
   * Throws `SessionNotRegisteredError` if the sessionId is not registered.
   */
  promote<T>(sessionId: SessionId, txFn: (state: UnpromotedSessionState) => T): T;

  /**
   * Best-effort idempotent cleanup: close the engine session, delete the
   * orphan tab rows, log, and remove the entry from the map.
   *
   * Each step is wrapped in a catch so a single failure does not abort the
   * remaining cleanup steps.
   */
  discard(sessionId: SessionId): Promise<void>;

  /**
   * Iterate all registered (not yet promoted or discarded) sessions.
   * Consumers MUST NOT mutate the map during iteration.
   */
  entries(): IterableIterator<[SessionId, UnpromotedSessionState]>;
}

/**
 * Typed error thrown by `promote()` when the session is not registered.
 */
export class SessionNotRegisteredError extends Error {
  constructor(public readonly sessionId: SessionId) {
    super(`SessionPromotionRegistry: session not registered: ${sessionId}`);
    this.name = "SessionNotRegisteredError";
  }
}

export interface SessionPromotionRegistryDeps {
  db: PraxisDb;
  log: Logger;
  /**
   * Lazy-resolver thunk: returns the EngineSessionManager at call time so the
   * registry can be constructed before the manager (avoids circular ordering).
   */
  engineSessionManager: () => EngineSessionManager;
}

export class SessionPromotionRegistryImpl implements SessionPromotionRegistry {
  private readonly map = new Map<SessionId, UnpromotedSessionState>();

  constructor(private readonly deps: SessionPromotionRegistryDeps) {}

  register(state: UnpromotedSessionState): void {
    this.map.set(state.sessionId, state);
  }

  get(sessionId: SessionId): UnpromotedSessionState | null {
    return this.map.get(sessionId) ?? null;
  }

  promote<T>(sessionId: SessionId, txFn: (state: UnpromotedSessionState) => T): T {
    const state = this.map.get(sessionId);
    if (!state) {
      throw new SessionNotRegisteredError(sessionId);
    }
    const result = txFn(state);
    this.map.delete(sessionId);
    return result;
  }

  async discard(sessionId: SessionId): Promise<void> {
    const state = this.map.get(sessionId);
    // Idempotent: nothing to do if already discarded/promoted.
    if (!state) {
      return;
    }

    // Step 1: close the engine session (best-effort).
    try {
      await this.deps.engineSessionManager().close(sessionId);
    } catch (err) {
      this.deps.log.warn("session-promotion-registry.discard.engine_close_failed", {
        sessionId,
        err: String(err),
      });
    }

    // Step 2: delete orphan tab rows (best-effort).
    try {
      this.deps.db.delete(tabs).where(eq(tabs.sessionId, sessionId)).run();
    } catch (err) {
      this.deps.log.warn("session-promotion-registry.discard.tab_delete_failed", {
        sessionId,
        err: String(err),
      });
    }

    // Step 3: log the discard.
    this.deps.log.info("session-promotion-registry.discard", { sessionId });

    // Step 4: remove from map.
    this.map.delete(sessionId);
  }

  entries(): IterableIterator<[SessionId, UnpromotedSessionState]> {
    return this.map.entries();
  }
}
