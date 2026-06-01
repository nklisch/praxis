/**
 * SessionPromoter — owns promotion eligibility detection and the promotion
 * transaction for lazy-persisted sessions.
 *
 * A session is "unpromoted" when it has been opened (engine session live,
 * tab row written) but not yet persisted to the `sessions` table. On the first
 * `send()` call, `SessionPromoter` runs a single SQLite transaction that:
 *   1. Inserts the session row.
 *   2. Records the first `user_message` episodic event.
 *   3. Removes the session from the `SessionPromotionRegistry`.
 *
 * After promotion, `SessionService.send()` yields the `user_message` event and
 * delegates to `_driveEngineTurn()` — exactly as for already-promoted sessions.
 *
 * Pattern: service-deps-injection (deps via constructor, no global lookups).
 */

import type { PraxisDb } from "../../db/index.js";
import { recordUserMessage } from "../../session/episodic.js";
import type { AssignmentId, CourseId, Logger, SessionId, StudentId } from "../../types/index.js";
import type {
  SessionPromotionRegistry,
  UnpromotedSessionState,
} from "./session-promotion-registry.js";

/**
 * The state returned after a successful promotion. All fields needed by
 * `SessionService.send()` to continue the turn without a DB round-trip.
 */
export interface PromotionResult {
  studentId: StudentId;
  modeId: string;
  engineId: string;
  userEventId: string;
  courseId?: CourseId;
  assignmentId?: AssignmentId;
}

export interface SessionPromoterDeps {
  db: PraxisDb;
  log: Logger;
  registry: SessionPromotionRegistry;
  persistSessionRow: (state: UnpromotedSessionState) => void;
}

export class SessionPromoter {
  constructor(private readonly deps: SessionPromoterDeps) {}

  /**
   * Returns true if the session is currently registered as unpromoted and
   * therefore needs to be promoted on this call to `send()`.
   *
   * Returns false if the session has already been promoted, discarded, or was
   * never registered (e.g. _persistImmediately sessions).
   */
  shouldPromote(sessionId: SessionId): boolean {
    return this.deps.registry.get(sessionId) !== null;
  }

  /**
   * Run the promotion transaction for the given session.
   *
   * Persists the session row + first `user_message` episodic event in a single
   * SQLite transaction, then removes the session from the registry.
   *
   * Returns the resolved session state so `SessionService.send()` can continue
   * the turn without an additional DB round-trip.
   *
   * Throws if the session is not registered (caller should check
   * `shouldPromote()` first) or if the transaction fails.
   */
  promote(sessionId: SessionId, message: string): PromotionResult {
    let result!: PromotionResult;

    this.deps.registry.promote(sessionId, (state) => {
      this.deps.db.transaction(() => {
        this.deps.persistSessionRow(state);
        const userEventId = recordUserMessage({
          db: this.deps.db,
          sessionId,
          studentId: state.studentId,
          engineId: state.engineId,
          modeId: state.modeId,
          turnIndex: 0,
          content: message,
        });
        result = {
          studentId: state.studentId,
          modeId: state.modeId,
          engineId: state.engineId,
          userEventId,
          ...(state.courseId !== undefined && { courseId: state.courseId }),
          ...(state.assignmentId !== undefined && { assignmentId: state.assignmentId }),
        };
      });
    });

    return result;
  }
}
