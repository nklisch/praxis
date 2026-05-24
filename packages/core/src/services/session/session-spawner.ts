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

import { assignments, notes } from "@praxis/artifacts/schema";
import { sessions } from "@praxis/memory/schema";
import { and, eq } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type {
  AssignmentId,
  CourseId,
  DocumentScopesService,
  EngineEvent,
  Logger,
  NoteId,
  SessionHandle,
  SessionId,
  StudentId,
} from "../../types/index.js";
import { brandId, parseNoteBody } from "../../types/index.js";
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

  /**
   * Open a new teach session pre-loaded with a note's cue context.
   * Mirrors `spawnFromAssignment` — creates a session then injects the
   * cue text as the first user message so the tutor opens with context.
   *
   * `cueId` is the string-encoded index into the cue list ("0", "1", …).
   * For feynman notes: cues are `followUps`; for cornell notes: cues are `questions`.
   * If omitted, falls back to the first available cue, then the note body.
   */
  async spawnFromNote(input: {
    studentId?: StudentId;
    noteId: NoteId;
    cueId?: string;
  }): Promise<SessionHandle> {
    // Resolve studentId — falls back to the default student if not supplied.
    const studentId: StudentId =
      input.studentId ?? (getOrCreateDefaultStudentId(this.deps.db) as StudentId);

    // Resolve the note row.
    const noteRow = this.deps.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, input.noteId), eq(notes.studentId, studentId)))
      .get();
    if (!noteRow) {
      throw new Error(`Note not found: ${input.noteId}`);
    }

    // Parse the body so we can extract the cue text.
    let cueText: string | null = null;
    let noteBodyText: string | null = null;

    if (noteRow.body != null && noteRow.format !== "sketch") {
      try {
        const body = parseNoteBody(
          noteRow.format as "cornell" | "feynman" | "outline" | "free",
          noteRow.body,
        );

        // Collect cues depending on format.
        if (body.kind === "feynman") {
          noteBodyText = body.explanation;
          const idx = input.cueId !== undefined ? parseInt(input.cueId, 10) : 0;
          cueText = body.followUps[idx] ?? body.followUps[0] ?? null;
        } else if (body.kind === "cornell") {
          const idx = input.cueId !== undefined ? parseInt(input.cueId, 10) : 0;
          cueText = body.questions[idx] ?? body.questions[0] ?? null;
          noteBodyText = body.details[idx] ?? body.details[0] ?? null;
        } else if (body.kind === "outline") {
          // Flat rows (new editor) or legacy tree root — extract the first meaningful text.
          if (body.rows !== undefined) {
            cueText = body.rows[0]?.text ?? null;
          } else if (body.root !== undefined) {
            cueText = body.root.text;
          }
        } else if (body.kind === "free") {
          cueText = body.text;
        }
      } catch {
        // If parsing fails, fall through with null cue (session still opens)
      }
    }

    // Compose the injected opening message.
    const parts: string[] = [];
    if (cueText) {
      parts.push(`<note-cue>${cueText}</note-cue>`);
    }
    if (noteBodyText) {
      parts.push(`<note-body>${noteBodyText}</note-body>`);
    }
    if (parts.length === 0) {
      parts.push("<note-cue>I have a question from my notes that I'd like to explore.</note-cue>");
    }
    const openingMessage =
      `I'm looking at my ${noteRow.format} notes and have a question I'd like to work through with you.\n\n` +
      parts.join("\n\n");

    // Start a teach session. _persistImmediately: true — this spawn path injects
    // an opening message before the student's first turn, so the session has meaning
    // before the student interacts. Registering it lazily would risk a discard race.
    const handle = await this.deps.startSession({ modeId: "teach", _persistImmediately: true });

    // Inject the cue as the first user message turn (fire-and-forget, non-streaming).
    // This seeds the session transcript so when the student opens the tab, the
    // tutor has already received the context and can respond immediately.
    try {
      const sessionId = handle.sessionId;
      const stream = this.deps.sendMessage(sessionId, openingMessage);
      for await (const _event of stream) {
        // Drain; we don't forward events — caller opens the tab and sees history.
      }
    } catch (cause) {
      this.deps.log.warn("spawn_from_note.opening_turn_failed", {
        noteId: input.noteId,
        err: cause instanceof Error ? cause.message : String(cause),
      });
      // Non-fatal: session is still valid; tutor just won't have pre-context.
    }

    return handle;
  }

  // spawnFromPassage added in step 4
}

// Export MAX_PASSAGE_LENGTH so spawnFromPassage (step 4) can reference the
// module-local constant once the method moves here.
export { MAX_PASSAGE_LENGTH };
