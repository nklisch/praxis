/**
 * SessionSpawner — owns the three spawnFrom* paths that create child sessions.
 *
 * All three variants share a structural pattern:
 *   1. Resolve `studentId` (falls back to default)
 *   2. Validate the target entity exists and belongs to student
 *   3. Call `startSession({ ..., _persistImmediately: true })`
 *   4. Optionally inject an opening turn via `sendMessage`
 *   5. Optionally set `parentSessionId` on the session row
 *   6. Return the `SessionHandle`
 *
 * Pattern: service-deps-injection (deps via constructor, closure ports into
 * SessionServiceImpl — mirrors session-promoter.ts exactly).
 */

import type { PraxisDb } from "../../db/index.js";
import type {
  AssignmentId,
  CourseId,
  DocumentScopesService,
  EngineEvent,
  Logger,
  SessionHandle,
  SessionId,
} from "../../types/index.js";

/** Maximum passage length injected into the opening message. */
const MAX_PASSAGE_LENGTH = 100_000;

export interface SessionSpawnerDeps {
  db: PraxisDb;
  log: Logger;
  /**
   * Port into SessionServiceImpl.start(). Used by all three spawnFrom* methods
   * to open the child session with _persistImmediately: true.
   */
  startSession: (opts: {
    modeId: string;
    courseId?: CourseId;
    assignmentId?: AssignmentId;
    _persistImmediately?: boolean;
  }) => Promise<SessionHandle>;
  /**
   * Port into SessionServiceImpl.send(). Used by spawnFromNote and
   * spawnFromPassage to inject an opening message before the student's first turn.
   */
  sendMessage: (sessionId: SessionId, message: string) => AsyncIterable<EngineEvent>;
  /** documentScopes service for passage-range attachment. */
  documentScopes: DocumentScopesService;
}

export class SessionSpawner {
  constructor(private readonly deps: SessionSpawnerDeps) {}

  // methods added in steps 2–4
}

// Export MAX_PASSAGE_LENGTH so spawnFromPassage (step 4) can reference the
// module-local constant once the method moves here.
export { MAX_PASSAGE_LENGTH };
