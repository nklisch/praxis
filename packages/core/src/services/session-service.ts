import { assignments, documentChunks, documents, notes } from "@praxis/artifacts/schema";
import { composeSystemPrompt } from "@praxis/curriculum/brief";
import { composeAssignmentContextFragment } from "@praxis/curriculum/brief/assignment-context";
import { composeCourseContextFragment } from "@praxis/curriculum/brief/course-context";
import {
  composeInCourseBehaviorFragment,
  type InCourseBehaviorModeId,
} from "@praxis/curriculum/brief/in-course-behavior";
import { createEngine } from "@praxis/engines";
import { type EngineSessionStateJson, episodicEvents, sessions } from "@praxis/memory/schema";
import { InProcessToolRegistry } from "@praxis/tools";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { readEngineConfig } from "../config/index.js";
import { appendEpisodic, nextTurnIndex, recordUserMessage } from "../session/episodic.js";
import { loadConversationHistory } from "../session/history.js";
import type {
  AssignmentId,
  ConversationTurn,
  CourseId,
  DocumentId,
  Engine,
  EngineEvent,
  EngineSession,
  GateId,
  Mode,
  NoteId,
  SessionEndSummary,
  SessionHandle,
  SessionId,
  SessionService,
  SessionSummary,
  StudentId,
  SystemNoteOrigin,
  Timestamp,
  ToolContext,
} from "../types/index.js";
import { brandId, engineError, parseNoteBody, serializeError } from "../types/index.js";
import { getOrCreateDefaultStudentId } from "./student.js";
import type { ServiceDeps } from "./types.js";

interface ActiveEntry {
  /** The Praxis session this entry belongs to. */
  sessionId: string;
  /** EngineId currently powering the session — used to detect engine swap. */
  engineId: string;
  /** Mode the session was started with — fixed for the session's lifetime. */
  mode: Mode;
  /** Open EngineSession; receives every send for this Praxis session. */
  handle: EngineSession;
  /** Engine instance — held for diagnostics. */
  engine: Engine;
  /**
   * Phase 16: true while a `send()` or synthetic turn is iterating the engine
   * stream. Used by `notifySession` to decide between live narration vs.
   * lazy delivery (leaving the system_note for the next real turn to pick up).
   */
  turnInFlight: boolean;
}

/**
 * Concrete implementation of SessionService. Manages active EngineSession
 * instances in memory (one per Praxis session), detects engine swaps, reopens
 * from episodic history on process restart, and records the full event
 * transcript to episodic.
 *
 * NOTE: @praxis/core/services imports @praxis/engines and @praxis/tools at
 * runtime — see CLAUDE.md Phase 3 dependency exception.
 */
export class SessionServiceImpl implements SessionService {
  private readonly activeSessions = new Map<string, ActiveEntry>();

  constructor(private readonly deps: ServiceDeps) {}

  async start(opts: {
    courseId?: CourseId;
    assignmentId?: AssignmentId;
    modeId: string;
  }): Promise<SessionHandle> {
    const mode = this.requireMode(opts.modeId);

    // Phase 11: configure mode requires the lock to be unlocked.
    // Bootstrap mode is intentionally NOT gated — configurators can bootstrap
    // without unlocking (first-run authoring before a lock is even set).
    if (opts.modeId === "configure") {
      const unlocked = await this.deps.lockService.isUnlocked();
      if (!unlocked) {
        throw new Error("Locked: configure surface requires unlock. Call lock.unlock(code) first.");
      }
    }

    const studentId = getOrCreateDefaultStudentId(this.deps.db);
    const engineConfig = readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log);
    const sessionId = uuidv7();
    const startedAt = new Date();

    this.deps.db
      .insert(sessions)
      .values({
        id: sessionId,
        studentId,
        modeId: mode.id,
        engineId: engineConfig.engineId,
        startedAt,
        ...(opts.courseId !== undefined && { courseId: opts.courseId }),
        ...(opts.assignmentId !== undefined && { assignmentId: opts.assignmentId }),
      })
      .run();

    // Eagerly open the engine session — surfaces config errors at start time.
    await this.openActive({
      sessionId,
      engineId: engineConfig.engineId,
      mode,
      studentId,
      priorTurns: [], // brand new session
      ...(opts.courseId !== undefined && { courseId: opts.courseId }),
      ...(opts.assignmentId !== undefined && { assignmentId: opts.assignmentId }),
    });

    return {
      sessionId: brandId<"SessionId">(sessionId),
      modeId: mode.id,
      startedAt: startedAt.getTime() as Timestamp,
      ...(opts.courseId !== undefined && { courseId: opts.courseId }),
      ...(opts.assignmentId !== undefined && { assignmentId: opts.assignmentId }),
    };
  }

  async *send(
    sessionId: SessionId,
    message: string,
    signal?: AbortSignal,
  ): AsyncIterable<EngineEvent> {
    const turnIndex = nextTurnIndex(this.deps.db, sessionId);
    const turnLog = this.deps.log.child({
      component: "session-service",
      sessionId,
      turnIndex,
    });
    turnLog.debug("turn.start", { messageLength: message.length });
    const sessionRow = this.deps.db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!sessionRow) {
      yield {
        type: "error",
        error: engineError("session.not_found", `Unknown session: ${sessionId}`),
      };
      return;
    }
    if (sessionRow.endedAt) {
      yield {
        type: "error",
        error: engineError("session.ended", "Cannot send to an ended session"),
      };
      return;
    }

    const mode = this.requireMode(sessionRow.modeId);
    const studentId = brandId<"StudentId">(sessionRow.studentId);
    const currentEngineId = readEngineConfig(
      this.deps.db,
      this.deps.secretStorage,
      this.deps.log,
    ).engineId;

    // Engine swap detection + reopen.
    let entry = this.activeSessions.get(sessionId);
    if (entry && entry.engineId !== currentEngineId) {
      this.deps.log.info("engine swap detected; closing active session", {
        sessionId,
        from: entry.engineId,
        to: currentEngineId,
      });
      const _oldEngineId = entry.engineId;
      await entry.handle.close().catch((err: unknown) => {
        this.deps.log.warn("session.engine_swap.close_failed", {
          sessionId,
          oldEngineId: _oldEngineId,
          err: serializeError(err),
        });
      });
      this.activeSessions.delete(sessionId);
      entry = undefined;
    }
    // Re-open if missing (process restart, swap above, or never opened).
    if (!entry) {
      const priorTurns = loadConversationHistory({ db: this.deps.db, sessionId });
      entry = await this.openActive({
        sessionId,
        engineId: currentEngineId,
        mode,
        studentId,
        priorTurns,
        ...(sessionRow.courseId !== null && {
          courseId: brandId<"CourseId">(sessionRow.courseId),
        }),
        ...(sessionRow.assignmentId !== null &&
          sessionRow.assignmentId !== undefined && {
            assignmentId: brandId<"AssignmentId">(sessionRow.assignmentId),
          }),
      });
    }

    // 1. Record + echo user message.
    recordUserMessage({
      db: this.deps.db,
      sessionId,
      studentId,
      engineId: entry.engineId,
      modeId: mode.id,
      turnIndex,
      content: message,
    });
    yield { type: "user_message", content: message };

    // 2. Drive the engine session for this turn; persist every event.
    const capturedEntry = entry;
    capturedEntry.turnInFlight = true;
    try {
      for await (const event of capturedEntry.handle.send(message, signal)) {
        try {
          appendEpisodic({
            db: this.deps.db,
            sessionId,
            studentId,
            engineId: capturedEntry.engineId,
            modeId: mode.id,
            turnIndex,
            event,
          });
        } catch (cause) {
          const writeErrorMsg = cause instanceof Error ? cause.message : String(cause);
          yield {
            type: "error",
            error: engineError("episodic.write_failed", writeErrorMsg, { cause }),
          };
        }
        yield event;

        // Defensive short-circuit: if the signal aborted but the engine didn't
        // honor it promptly, emit the interrupted event and return cleanly.
        if (signal?.aborted) {
          // Interrupt any in-flight sub-agent items so the UI transitions them
          // to "interrupted" without waiting for natural drain.
          this.deps.subAgent?.interruptAllForSession(sessionId);

          const interrupted: EngineEvent = { type: "interrupted", reason: "user_cancel" };
          try {
            appendEpisodic({
              db: this.deps.db,
              sessionId,
              studentId,
              engineId: capturedEntry.engineId,
              modeId: mode.id,
              turnIndex,
              event: interrupted,
            });
          } catch {
            /* non-fatal: episodic write failure on interrupt is best-effort */
          }
          yield interrupted;
          return;
        }
      }
    } catch (cause) {
      const errMsg = cause instanceof Error ? cause.message : String(cause);
      yield { type: "error", error: engineError("engine.send_failed", errMsg, { cause }) };
    } finally {
      capturedEntry.turnInFlight = false;
    }

    // Phase 7: schedule post-turn indexer pass (debounced, fire-and-forget).
    this.deps.indexerOrchestrator?.scheduleAfterTurn({
      studentId,
      sessionId: brandId<"SessionId">(sessionId),
    });
  }

  async end(sessionId: SessionId): Promise<SessionEndSummary> {
    const entry = this.activeSessions.get(sessionId);
    if (entry) {
      await entry.handle.close().catch((err: unknown) => {
        this.deps.log.warn("session.end.close_failed", {
          sessionId,
          err: serializeError(err),
        });
      });
      this.activeSessions.delete(sessionId);
    }

    // Phase 7: run session-end indexers (e.g. misconception detection) synchronously
    // before closing the session row so misconceptions land before the UI navigates away.
    if (this.deps.indexerOrchestrator) {
      const sessionRow = this.deps.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .get();
      if (sessionRow) {
        await this.deps.indexerOrchestrator
          .runAtSessionEnd({
            studentId: brandId<"StudentId">(sessionRow.studentId),
            sessionId: brandId<"SessionId">(sessionId),
          })
          .catch((err: unknown) => {
            this.deps.log.warn("session.end.indexer_failed", { error: String(err) });
          });
        this.deps.indexerOrchestrator.cancel(brandId<"SessionId">(sessionId));
      }
    }

    // Phase 9: Run gate evaluator if the session has a courseId.
    let unlockedGates: GateId[] = [];
    const sessionRowForGates = this.deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    if (sessionRowForGates?.courseId) {
      try {
        const result = await this.deps.toolServices.artifacts.evaluateAndPersistGates({
          studentId: brandId<"StudentId">(sessionRowForGates.studentId),
          courseId: brandId<"CourseId">(sessionRowForGates.courseId),
        });
        unlockedGates = result.unlockedGateIds;
      } catch (cause) {
        this.deps.log.warn("session.end.gate_eval_failed", {
          sessionId,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }

    const endedAt = new Date();
    this.deps.db.update(sessions).set({ endedAt }).where(eq(sessions.id, sessionId)).run();
    return {
      sessionId,
      endedAt: endedAt.getTime() as Timestamp,
      unlockedGates,
      newMisconceptions: 0,
    };
  }

  async active(): Promise<SessionHandle | null> {
    const studentId = getOrCreateDefaultStudentId(this.deps.db);
    const row = this.deps.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.studentId, studentId), isNull(sessions.endedAt)))
      .orderBy(desc(sessions.startedAt))
      .get();
    if (!row) return null;
    return {
      sessionId: brandId<"SessionId">(row.id),
      modeId: row.modeId,
      startedAt: row.startedAt.getTime() as Timestamp,
      ...(row.courseId !== null && { courseId: brandId<"CourseId">(row.courseId) }),
      ...(row.assignmentId !== null &&
        row.assignmentId !== undefined && {
          assignmentId: brandId<"AssignmentId">(row.assignmentId),
        }),
    };
  }

  async list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]> {
    const studentId = getOrCreateDefaultStudentId(this.deps.db);
    const limit = opts?.limit ?? 100;
    const includeEnded = opts?.includeEnded ?? true;

    const where = includeEnded
      ? eq(sessions.studentId, studentId)
      : and(eq(sessions.studentId, studentId), isNull(sessions.endedAt));

    const rows = this.deps.db
      .select()
      .from(sessions)
      .where(where)
      .orderBy(desc(sessions.startedAt))
      .limit(limit)
      .all();

    return rows.map((row) => {
      // Fetch the first user_message episodic event for this session (N round trips,
      // capped by limit — acceptable for v1; revisit if Library load gets slow).
      const firstEvent = this.deps.db
        .select({ eventJson: episodicEvents.eventJson })
        .from(episodicEvents)
        .where(eq(episodicEvents.sessionId, row.id))
        .orderBy(asc(episodicEvents.ts))
        .limit(10) // fetch a few candidates and filter in JS for user_message events
        .all();

      let firstUserMessage: string | undefined;
      for (const evt of firstEvent) {
        // biome-ignore lint/suspicious/noExplicitAny: eventJson is EngineEvent stored as JSON
        const event = evt.eventJson as any;
        if (event?.type === "user_message" && typeof event.content === "string") {
          const content: string = event.content;
          firstUserMessage = content.length > 60 ? `${content.slice(0, 60)}…` : content;
          break;
        }
      }

      return {
        sessionId: brandId<"SessionId">(row.id),
        modeId: row.modeId,
        startedAt: row.startedAt.getTime() as Timestamp,
        endedAt: row.endedAt ? (row.endedAt.getTime() as Timestamp) : null,
        ...(row.courseId !== null &&
          row.courseId !== undefined && {
            courseId: brandId<"CourseId">(row.courseId),
          }),
        ...(row.assignmentId !== null &&
          row.assignmentId !== undefined && {
            assignmentId: brandId<"AssignmentId">(row.assignmentId),
          }),
        ...(firstUserMessage !== undefined && { firstUserMessage }),
      };
    });
  }

  /**
   * Phase 16: append a system_note to a session's episodic stream.
   *
   * If the session is currently in `activeSessions` AND no turn is in flight,
   * drives a synthetic turn so the tutor narrates feedback live. The prefixed
   * note is sent as the "user" message so all engine adapters see it without
   * requiring role-injection support.
   *
   * If the session is not active or is busy, the note sits in the episodic
   * stream and `loadConversationHistory` surfaces it on the next real turn.
   */
  async notifySession(input: {
    sessionId: SessionId;
    note: string;
    origin: SystemNoteOrigin;
  }): Promise<void> {
    const sessionRow = this.deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .get();
    if (!sessionRow || sessionRow.endedAt) return;

    const studentId = brandId<"StudentId">(sessionRow.studentId);
    const mode = this.deps.modes.get(sessionRow.modeId);
    if (!mode) return;

    const engineId = sessionRow.engineId;
    const turnIndex = nextTurnIndex(this.deps.db, input.sessionId);

    // Always append the system_note to episodic first so resume sees it
    // even if the synthetic turn fails midstream.
    appendEpisodic({
      db: this.deps.db,
      sessionId: input.sessionId,
      studentId,
      engineId,
      modeId: mode.id,
      turnIndex,
      event: { type: "system_note", content: input.note, origin: input.origin },
    });

    const entry = this.activeSessions.get(input.sessionId);
    if (!entry || entry.turnInFlight) {
      // Lazy delivery — the note is in the transcript; next real send() picks it up.
      return;
    }

    // Drive a synthetic turn so the tutor narrates live.
    const prefixedNote = `[Praxis: assignment submission notice]\n${input.note}`;
    const syntheticTurnIndex = nextTurnIndex(this.deps.db, input.sessionId);
    entry.turnInFlight = true;
    try {
      for await (const event of entry.handle.send(prefixedNote)) {
        try {
          appendEpisodic({
            db: this.deps.db,
            sessionId: input.sessionId,
            studentId,
            engineId: entry.engineId,
            modeId: mode.id,
            turnIndex: syntheticTurnIndex,
            event,
          });
        } catch (cause) {
          this.deps.log.warn("notify_session.episodic_write_failed", {
            sessionId: input.sessionId,
            err: cause instanceof Error ? cause.message : String(cause),
          });
        }
        // Note: we don't yield these events — the synthetic turn is fire-and-forget
        // from the assignment service's perspective. A future Phase can wire a
        // per-session EventEmitter here to forward events to the active renderer.
      }
    } catch (cause) {
      this.deps.log.warn("notify_session.synthetic_turn_failed", {
        sessionId: input.sessionId,
        err: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      entry.turnInFlight = false;
    }
  }

  /**
   * Phase 16: open a new child session bound to an assignment, deriving the
   * mode from the assignment's kind. The child session's `parentSessionId` is
   * set to `parentSessionId` so the tab UI can link back to the tutor tab.
   */
  async spawnFromAssignment(input: {
    assignmentId: AssignmentId;
    parentSessionId: SessionId;
  }): Promise<SessionHandle> {
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
    const handle = await this.start({
      modeId,
      assignmentId: input.assignmentId,
      courseId: brandId<"CourseId">(assignmentRow.courseId),
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

    // Start a teach session.
    const handle = await this.start({ modeId: "teach" });

    // Inject the cue as the first user message turn (fire-and-forget, non-streaming).
    // This seeds the session transcript so when the student opens the tab, the
    // tutor has already received the context and can respond immediately.
    try {
      const sessionId = handle.sessionId;
      // biome-ignore lint/suspicious/noExplicitAny: engine send is async-iterable; drain it
      const stream = this.send(sessionId as any, openingMessage);
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

  /**
   * Open a new teach session scoped to a specific passage in a document.
   * Mirrors `spawnFromNote` — creates a teach session then injects the passage
   * text as the first user message wrapped in `<passage>...</passage>` so the
   * tutor opens with the right context.
   *
   * The document is attached to the session via DocumentScopesService with the
   * passage range stored so the document viewer can render the `†` marker.
   *
   * `studentId` may be omitted — falls back to getOrCreateDefaultStudentId.
   */
  async spawnFromPassage(input: {
    studentId?: StudentId;
    documentId: DocumentId;
    range: { startOffset: number; endOffset: number };
  }): Promise<SessionHandle> {
    const studentId: StudentId =
      input.studentId ?? (getOrCreateDefaultStudentId(this.deps.db) as StudentId);

    // Verify the document exists and belongs to this student.
    const docRow = this.deps.db
      .select({ id: documents.id, filename: documents.filename })
      .from(documents)
      .where(and(eq(documents.id, input.documentId), eq(documents.studentId, studentId)))
      .get();
    if (!docRow) {
      throw new Error(`Document not found: ${input.documentId}`);
    }

    // Fetch all chunks for the document in order, then join to get the full text.
    const chunkRows = this.deps.db
      .select({ text: documentChunks.text })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, input.documentId))
      .orderBy(asc(documentChunks.chunkIndex))
      .all();

    const fullText = chunkRows.map((c) => c.text).join("\n\n");

    // Extract the passage text from the range — clamp to document bounds.
    const safeStart = Math.max(0, Math.min(input.range.startOffset, fullText.length));
    const safeEnd = Math.max(safeStart, Math.min(input.range.endOffset, fullText.length));
    const passageText = fullText.slice(safeStart, safeEnd).trim();

    // Compose the injected opening message.
    const openingMessage =
      `I'm studying a document ("${docRow.filename}") and would like to explore a passage with you.\n\n` +
      (passageText
        ? `<passage>${passageText}</passage>`
        : "<passage>[passage text unavailable]</passage>");

    // Start a teach session.
    const handle = await this.start({ modeId: "teach" });

    // Attach the document to this session with the passage range so the viewer
    // can render the † marker later.
    if (this.deps.toolServices.documentScopes) {
      try {
        await this.deps.toolServices.documentScopes.attach({
          scope: { kind: "session", id: handle.sessionId },
          documentId: input.documentId,
          source: "manual",
          passageRange: input.range,
        });
      } catch (cause) {
        this.deps.log.warn("spawn_from_passage.scope_attach_failed", {
          documentId: input.documentId,
          sessionId: handle.sessionId,
          err: cause instanceof Error ? cause.message : String(cause),
        });
        // Non-fatal: session still valid; viewer just won't render the marker.
      }
    }

    // Inject the passage as the opening user message (fire-and-forget, non-streaming).
    try {
      const sessionId = handle.sessionId;
      // biome-ignore lint/suspicious/noExplicitAny: engine send is async-iterable; drain it
      const stream = this.send(sessionId as any, openingMessage);
      for await (const _event of stream) {
        // Drain; we don't forward events — caller opens the tab and sees history.
      }
    } catch (cause) {
      this.deps.log.warn("spawn_from_passage.opening_turn_failed", {
        documentId: input.documentId,
        err: cause instanceof Error ? cause.message : String(cause),
      });
      // Non-fatal: session is still valid; tutor just won't have pre-context.
    }

    return handle;
  }

  /** Tear down all active engine sessions. Called on host shutdown. */
  async shutdown(): Promise<void> {
    const entries = [...this.activeSessions.values()];
    this.activeSessions.clear();
    await Promise.all(
      entries.map((e) =>
        e.handle.close().catch((err: unknown) => {
          this.deps.log.warn("session.shutdown.close_failed", {
            sessionId: e.sessionId,
            err: serializeError(err),
          });
        }),
      ),
    );
    // Phase 7: shut down the indexer orchestrator (clears all debounce timers).
    this.deps.indexerOrchestrator?.shutdown?.();
  }

  private async openActive(args: {
    sessionId: string;
    engineId: string;
    mode: Mode;
    studentId: string;
    priorTurns: ConversationTurn[];
    courseId?: CourseId;
    assignmentId?: AssignmentId;
  }): Promise<ActiveEntry> {
    const engineConfig = readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log);
    const factory = this.deps.engineFactory ?? ((c, d) => createEngine({ config: c, deps: d }));
    const engine = factory(engineConfig, { log: this.deps.log });

    // Phase 6 + 7: inject course-context override when a courseId is set.
    // Phase 8: inject assignment-context override when an assignmentId is set.
    //
    // Prompt-customization-layers: seed the overrides map from stored fragment
    // overrides FIRST so that the dynamic course-context / assignment-context
    // blocks below can overwrite any stale user overrides for the same fragment
    // ids. Dynamic state always wins — a stale user override of
    // `context.course-state` must NOT mask the live course state.
    let overrides: Map<string, string> | undefined;
    if (this.deps.promptCustomization) {
      const storedOverrides = this.deps.promptCustomization.listFragmentOverrides(args.mode.id);
      if (storedOverrides.length > 0) {
        overrides = new Map(storedOverrides.map((o) => [o.fragmentId, o.override]));
      }
    }

    if (args.courseId && this.deps.toolServices.courseState) {
      const snapshot = await this.deps.toolServices.courseState.read({
        studentId: args.studentId as StudentId,
        courseId: args.courseId,
      });
      if (snapshot) {
        // Phase 7: build a conceptId → effectivePKnown map from the student model.
        let masteryByConceptId: ReadonlyMap<string, number> | undefined;
        if (this.deps.toolServices.memory) {
          try {
            const studentModel = await this.deps.toolServices.memory.studentModel(
              args.studentId as StudentId,
            );
            const masteryMap = new Map<string, number>();
            for (const [conceptId, mastery] of studentModel.conceptMastery) {
              // Only include concepts in this course's snapshot
              if (snapshot.conceptsById.has(conceptId)) {
                masteryMap.set(conceptId, mastery.effectivePKnown);
              }
            }
            if (masteryMap.size > 0) {
              masteryByConceptId = masteryMap;
            }
          } catch {
            // Non-fatal: mastery data unavailable; fall back to binary tags
          }
        }

        // Coalesce the course-documents read with the existing
        // `courseDocumentIds` computation below — the document attachments
        // feed both the prompt's "Available documents" section and the
        // `toolContext.courseDocumentIds`.
        // `listForScopeDetailed` is a newer accessor; fall back gracefully
        // if a test fake doesn't implement it.
        const courseDocuments =
          typeof this.deps.toolServices.documentScopes.listForScopeDetailed === "function"
            ? await this.deps.toolServices.documentScopes
                .listForScopeDetailed({
                  kind: "course",
                  id: args.courseId,
                })
                .catch(() => undefined)
            : undefined;

        const fragment = composeCourseContextFragment(
          snapshot,
          masteryByConceptId,
          courseDocuments,
        );
        // Use the overrides map so the existing "context.course-state" fragment
        // (which is customizable: true) is replaced by the dynamic course content.
        overrides = new Map([[fragment.id, fragment.template]]);

        // Course-aware mode-prompts: inject the per-mode behavior addendum
        // when the active mode is in the in-course set. Bootstrap / configure
        // are excluded — they have their own contracts and no notion of an
        // active course.
        const inCourseModes: ReadonlySet<string> = new Set<string>([
          "teach",
          "quiz",
          "homework",
          "exam",
          "study-skills",
        ]);
        if (inCourseModes.has(args.mode.id)) {
          const behavior = composeInCourseBehaviorFragment(
            args.mode.id as InCourseBehaviorModeId,
            snapshot,
          );
          overrides.set(behavior.id, behavior.template);
        }

        // Phase 9: If there are newly-unlocked gates the student hasn't viewed yet,
        // inject a small "Newly unlocked" fragment to the pre-session brief.
        if (this.deps.toolServices.artifacts.newlyUnlockedCount) {
          try {
            const newlyUnlockedCount = await this.deps.toolServices.artifacts.newlyUnlockedCount({
              studentId: args.studentId as StudentId,
              courseId: args.courseId,
            });
            if (newlyUnlockedCount > 0) {
              const newlyUnlockedId = "context.newly-unlocked";
              const newlyUnlockedTemplate = `Newly unlocked since your last session: ${newlyUnlockedCount} gate${newlyUnlockedCount === 1 ? "" : "s"} now available. Celebrate this with the student briefly before getting into the lesson.`;
              overrides.set(newlyUnlockedId, newlyUnlockedTemplate);
            }
          } catch {
            // Non-fatal: don't block session start if badge count fails.
          }
        }
      }
    }

    // Phase 8: inject assignment-context override when an assignmentId is set.
    if (args.assignmentId && this.deps.toolServices.assignments) {
      const assignment = await this.deps.toolServices.assignments.get({
        assignmentId: args.assignmentId,
      });
      const responses = await this.deps.toolServices.assignments.getResponses({
        assignmentId: args.assignmentId,
      });
      if (assignment) {
        const fragment = composeAssignmentContextFragment({ assignment, responses });
        overrides = new Map([...(overrides ?? []), [fragment.id, fragment.template]]);
      }
    }

    // Prompt-customization-layers: inject the two user-authored layers as
    // additionalFragments so they sort into the user-global / user-append slots.
    const additionalFragments: import("../types/index.js").PromptFragment[] = [];
    if (this.deps.promptCustomization) {
      const globalText = this.deps.promptCustomization.getGlobalFragment();
      if (globalText !== null) {
        additionalFragments.push({
          id: "user.global",
          position: "user-global",
          customizable: true,
          template: globalText,
        });
      }
      const appendText = this.deps.promptCustomization.getModeAppend(args.mode.id);
      if (appendText !== null) {
        additionalFragments.push({
          id: `user.append.${args.mode.id}`,
          position: "user-append",
          customizable: true,
          template: appendText,
        });
      }
    }

    const systemPrompt = composeSystemPrompt({
      mode: args.mode,
      ...(overrides !== undefined && { overrides }),
      ...(additionalFragments.length > 0 && { additionalFragments }),
    });

    // Phase 16: pre-compute course-attached document ids for tool context.
    // Tools consume this directly to avoid a per-dispatch DB call.
    const courseDocumentIds: DocumentId[] | undefined =
      args.courseId !== undefined
        ? await this.deps.toolServices.documentScopes.listForScope({
            kind: "course",
            id: args.courseId,
          })
        : undefined;

    const toolContext: ToolContext = {
      studentId: args.studentId as ToolContext["studentId"],
      sessionId: args.sessionId as ToolContext["sessionId"],
      ...(args.courseId !== undefined && { courseId: args.courseId }),
      ...(args.assignmentId !== undefined && { assignmentId: args.assignmentId }),
      ...(courseDocumentIds !== undefined && { courseDocumentIds }),
      services: {
        memory: this.deps.toolServices.memory, // ← Phase 7
        artifacts: this.deps.toolServices.artifacts, // ← Phase 6
        bootstrap: this.deps.toolServices.bootstrap, // ← Phase 6
        courseState: this.deps.toolServices.courseState, // ← Phase 6
        vectorStore: this.deps.toolServices.vectorStore,
        ftsStore: this.deps.toolServices.ftsStore,
        embeddings: this.deps.toolServices.embeddings,
        documents: this.deps.toolServices.documents,
        sandbox: this.deps.toolServices.sandbox,
        sympy: this.deps.toolServices.sympy,
        assignments: this.deps.toolServices.assignments, // ← Phase 8
        packs: this.deps.toolServices.packs, // ← Phase 10
        ...(this.deps.indexerOrchestrator !== undefined && {
          indexerOrchestrator: this.deps.indexerOrchestrator,
        }), // ← Phase 7 (optional)
        pedagogyPack: this.deps.toolServices.pedagogyPack, // ← Phase 18
        lock: this.deps.toolServices.lock,
        authoring: this.deps.toolServices.authoring,
        notes: this.deps.toolServices.notes,
        flashcards: this.deps.toolServices.flashcards,
        fsrsScheduler: this.deps.toolServices.fsrsScheduler,
        // Phase 15a: sketch + vision — undefined when not wired (tool handlers guard).
        ...(this.deps.toolServices.sketches !== undefined && {
          sketches: this.deps.toolServices.sketches,
        }),
        ...(this.deps.toolServices.vision !== undefined && {
          vision: this.deps.toolServices.vision,
        }),
        // Phase 16: polymorphic scope ↔ document attachment service — always present.
        documentScopes: this.deps.toolServices.documentScopes,
        // Phase 16: engine resolver — used by tools that spawn isolated agent sessions.
        engineResolver: this.deps.toolServices.engineResolver,
        // Bootstrap budget resolver — read by course.start_exploration.
        ...(this.deps.toolServices.bootstrapConfigResolver !== undefined && {
          bootstrapConfigResolver: this.deps.toolServices.bootstrapConfigResolver,
        }),
        // Activity registry — optional; wired from ServiceDeps when available.
        ...(this.deps.activity !== undefined && { activity: this.deps.activity }),
        // Sub-agent transparency registry — optional; wired from ServiceDeps.toolServices.
        ...(this.deps.toolServices.subAgent !== undefined && {
          subAgent: this.deps.toolServices.subAgent,
        }),
        // Phase 17: quick-check dispatch — wires the human-in-the-loop service
        // through to ask_student_question and the five quick_check.* tools.
        // Without this, those handlers see `quickCheck === undefined`, short-circuit
        // on `!answer`, and return `{ abandoned: true }` without ever surfacing
        // the inline card to the renderer.
        ...(this.deps.toolServices.quickCheck !== undefined && {
          quickCheck: this.deps.toolServices.quickCheck,
        }),
      },
      log: this.deps.log,
    };

    // Phase 4: filter toolDefinitions by mode.toolNames.
    const enabledNames = new Set(args.mode.toolNames);
    const enabledTools =
      enabledNames.size === 0
        ? this.deps.toolDefinitions // empty array means "all available" for backward compat
        : this.deps.toolDefinitions.filter((t) => enabledNames.has(t.name));

    const sessionId = args.sessionId;
    const tools = new InProcessToolRegistry({
      tools: enabledTools,
      context: toolContext,
      log: this.deps.log.child({ component: "tool-dispatch", sessionId }),
    });

    // Unit 5d: prefer native engine resume over text-splice when possible.
    const resumeId = this.resolveResumeEngineSessionId(args.sessionId, args.engineId);

    const handle = await engine.open({
      systemPrompt,
      tools,
      ...(resumeId !== undefined
        ? // Same-engine continuation: use native resume; skip priorTurns.
          { resumeEngineSessionId: resumeId }
        : // Engine swap or first open: replay transcript via text-splice.
          args.priorTurns.length > 0
          ? { priorTurns: args.priorTurns }
          : {}),
      onEngineSessionReady: (engineSessionId) => {
        this.recordEngineSessionId(args.sessionId, args.engineId, engineSessionId);
      },
    });

    const entry: ActiveEntry = {
      sessionId: args.sessionId,
      engineId: args.engineId,
      mode: args.mode,
      handle,
      engine,
      turnInFlight: false,
    };
    this.activeSessions.set(args.sessionId, entry);
    return entry;
  }

  /**
   * Looks up engineSessionStateJson on the sessions row and returns the
   * stored CLI session id for the given engineId if present. Returns
   * undefined when there is no usable state to resume from.
   */
  private resolveResumeEngineSessionId(sessionId: string, engineId: string): string | undefined {
    const row = this.deps.db
      .select({ state: sessions.engineSessionStateJson })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    return row?.state?.[engineId]?.engineSessionId;
  }

  /**
   * Atomic read-modify-write: merges `{ engineSessionId, lastTurnAt }` into
   * engineSessionStateJson under the given engineId. Using a transaction
   * ensures concurrent opens of the same Praxis session don't clobber state.
   */
  private recordEngineSessionId(
    sessionId: string,
    engineId: string,
    engineSessionId: string,
  ): void {
    this.deps.db.transaction((tx) => {
      const row = tx
        .select({ state: sessions.engineSessionStateJson })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .get();
      const next: EngineSessionStateJson = { ...(row?.state ?? {}) };
      next[engineId] = { engineSessionId, lastTurnAt: Date.now() };
      tx.update(sessions)
        .set({ engineSessionStateJson: next })
        .where(eq(sessions.id, sessionId))
        .run();
    });
  }

  private requireMode(modeId: string): Mode {
    const mode = this.deps.modes.get(modeId);
    if (!mode) throw new Error(`Unknown mode: ${modeId}`);
    return mode;
  }
}
