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

import { assignments } from "@praxis/artifacts/schema";
import { sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
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
import { brandId } from "../../types/index.js";
import { getOrCreateDefaultStudentId } from "../student.js";

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

  /**
   * Phase 16: open a new child session bound to an assignment, deriving the
   * mode from the assignment's kind. The child session's `parentSessionId` is
   * set to `parentSessionId` so the tab UI can link back to the tutor tab.
   */
  async spawnFromAssignment(input: {
    assignmentId: AssignmentId;
    parentSessionId: SessionId;
  }): Promise<SessionHandle> {
    // Resolve the current student (single-user; server-side only).
    const studentId = getOrCreateDefaultStudentId(this.deps.db);

    // Validate parent session exists and belongs to this student.
    const parentRow = this.deps.db
      .select({ id: sessions.id, studentId: sessions.studentId })
      .from(sessions)
      .where(eq(sessions.id, input.parentSessionId))
      .get();
    if (!parentRow) {
      throw new Error(`Parent session not found: ${input.parentSessionId}`);
    }
    if (parentRow.studentId !== studentId) {
      throw new Error(`Parent session belongs to a different student`);
    }

    const assignmentRow = this.deps.db
      .select()
      .from(assignments)
      .where(eq(assignments.id, input.assignmentId))
      .get();
    if (!assignmentRow) {
      throw new Error(`Assignment not found: ${input.assignmentId}`);
    }

    // Derive mode from assignment kind.
    const modeId = assignmentRow.kind; // "quiz" | "homework" | "exam" map 1:1 to mode ids

    // Start the session using the existing start() path (handles lock checks, engine open, etc.)
    // _persistImmediately: true — parent-linked sessions have meaning before any student turn;
    // skipping the registry avoids accidentally dropping them on tab-close.
    const handle = await this.deps.startSession({
      modeId,
      assignmentId: input.assignmentId,
      courseId: brandId<"CourseId">(assignmentRow.courseId),
      _persistImmediately: true,
    });

    // Update the session row to set parentSessionId.
    this.deps.db
      .update(sessions)
      .set({ parentSessionId: input.parentSessionId })
      .where(eq(sessions.id, handle.sessionId))
      .run();

    return {
      ...handle,
      parentSessionId: input.parentSessionId,
    };
  }

  // spawnFromNote and spawnFromPassage added in steps 3–4
}

// Export MAX_PASSAGE_LENGTH so spawnFromPassage (step 4) can reference the
// module-local constant once the method moves here.
export { MAX_PASSAGE_LENGTH };
