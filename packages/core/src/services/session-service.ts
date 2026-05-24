import { assignments, documentChunks, documents, notes } from "@praxis/artifacts/schema";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { and, asc, desc, eq, isNull, notInArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { readEngineConfig } from "../config/index.js";
import { appendEpisodic, nextTurnIndex, recordUserMessage } from "../session/episodic.js";
import type {
  AssignmentId,
  CourseId,
  DocumentId,
  EngineEvent,
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
} from "../types/index.js";
import { brandId, engineError, parseNoteBody } from "../types/index.js";
import { SessionDiscardedError } from "../types/session-discarded-error.js";
import { type ActiveEntry, EngineSessionManager } from "./session/engine-session-manager.js";
import type { UnpromotedSessionState } from "./session/session-promotion-registry.js";
import { getOrCreateDefaultStudentId } from "./student.js";
import type { ServiceDeps } from "./types.js";

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
  /** Exposed for SessionPromotionRegistryImpl's lazy-resolver thunk in buildServices. */
  readonly engineManager: EngineSessionManager;

  constructor(private readonly deps: ServiceDeps) {
    this.engineManager = new EngineSessionManager({
      db: deps.db,
      log: deps.log,
      secretStorage: deps.secretStorage,
      toolDefinitions: deps.toolDefinitions,
      toolServices: deps.toolServices,
      ...(deps.indexerOrchestrator !== undefined && {
        indexerOrchestrator: deps.indexerOrchestrator,
      }),
      ...(deps.activity !== undefined && { activity: deps.activity }),
      ...(deps.subAgent !== undefined && { subAgent: deps.subAgent }),
      ...(deps.promptCustomization !== undefined && {
        promptCustomization: deps.promptCustomization,
      }),
      ...(deps.engineFactory !== undefined && { engineFactory: deps.engineFactory }),
    });
  }

  async start(opts: {
    courseId?: CourseId;
    assignmentId?: AssignmentId;
    modeId: string;
    /**
     * INTERNAL FLAG — do not expose via public IPC schema.
     * When true, persist the session row immediately (used by parent-linked
     * spawn paths: spawnFromAssignment, spawnFromNote, spawnFromPassage).
     * When false/undefined, register with SessionPromotionRegistry instead
     * (lazy-persist; only promoted on first user message).
     */
    _persistImmediately?: boolean;
  }): Promise<SessionHandle> {
    const mode = this.requireMode(opts.modeId);

    // Phase 11: configure mode requires the lock to be unlocked.
    // Course-create mode is intentionally NOT gated — configurators can create
    // courses without unlocking (first-run authoring before a lock is even set).
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

    const state: UnpromotedSessionState = {
      sessionId: brandId<"SessionId">(sessionId),
      studentId: brandId<"StudentId">(studentId),
      modeId: mode.id,
      engineId: engineConfig.engineId,
      startedAt: startedAt.getTime() as Timestamp,
      ...(opts.courseId !== undefined && { courseId: opts.courseId }),
      ...(opts.assignmentId !== undefined && { assignmentId: opts.assignmentId }),
    };

    if (opts._persistImmediately === true || this.deps.sessionPromotionRegistry === undefined) {
      // Parent-linked sessions (and legacy paths without a registry) persist immediately.
      this._persistSessionRow(state);
    } else {
      // Lazy-persist: register in the registry; the row is written on first send().
      this.deps.sessionPromotionRegistry.register(state);
    }

    // Eagerly open the engine session — surfaces config errors at start time.
    // The registry knows the engine manager so discard() can close it later.
    await this.engineManager.openActive({
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

  /**
   * Insert the session row into the `sessions` table. Called either at
   * `start()` time (when _persistImmediately is set or no registry available)
   * or at first `send()` time (promote path) inside a transaction.
   */
  private _persistSessionRow(state: UnpromotedSessionState): void {
    this.deps.db
      .insert(sessions)
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
  }

  /**
   * Discard a session if it has never been promoted (no user message was
   * sent). Returns `{ discarded: true }` when the registry entry was found
   * and cleaned up; `{ discarded: false }` otherwise (already promoted or
   * never registered). Safe to call on already-promoted sessions.
   */
  async discardIfUnpromoted(sessionId: SessionId): Promise<{ discarded: boolean }> {
    if (!this.deps.sessionPromotionRegistry) return { discarded: false };
    const unpromoted = this.deps.sessionPromotionRegistry.get(sessionId);
    if (unpromoted === null) return { discarded: false };
    await this.deps.sessionPromotionRegistry.discard(sessionId);
    return { discarded: true };
  }

  async *send(
    sessionId: SessionId,
    message: string,
    signal?: AbortSignal,
  ): AsyncIterable<EngineEvent> {
    // ── Lazy-persist: promote on first user message ───────────────────────────
    // If the session is in the registry (unpromoted), persist the session row +
    // first user_message episodic event in a single SQLite transaction.
    // If neither the registry nor the DB has this session, it was discarded.
    const registry = this.deps.sessionPromotionRegistry;
    if (registry !== undefined) {
      const unpromotedState = registry.get(sessionId);
      if (unpromotedState !== null) {
        // Promote: run the persist transaction, then remove from registry.
        try {
          const studentId = unpromotedState.studentId;
          const engineId = unpromotedState.engineId;
          const modeId = unpromotedState.modeId;
          registry.promote(sessionId, (state) => {
            // Single transaction: insert session row + first episodic event.
            this.deps.db.transaction(() => {
              this._persistSessionRow(state);
              recordUserMessage({
                db: this.deps.db,
                sessionId,
                studentId,
                engineId,
                modeId,
                turnIndex: 0,
                content: message,
              });
            });
          });
          // Echo the user message event; continue into the engine loop below.
          yield { type: "user_message", content: message };
          // Resolve the mode + entry for the engine loop (skip the DB lookup below).
          const mode = this.requireMode(modeId);
          const currentEngineId = readEngineConfig(
            this.deps.db,
            this.deps.secretStorage,
            this.deps.log,
          ).engineId;
          const entry = await this.engineManager.acquire({
            sessionId,
            currentEngineId,
            mode,
            studentId,
            ...(unpromotedState.courseId !== undefined && {
              courseId: unpromotedState.courseId,
            }),
            ...(unpromotedState.assignmentId !== undefined && {
              assignmentId: unpromotedState.assignmentId,
            }),
          });
          yield* this._driveEngineTurn({
            entry,
            sessionId,
            studentId,
            mode,
            message,
            signal,
          });
          return;
        } catch (err) {
          // If promote or the transaction failed, surface as an error event.
          const errMsg = err instanceof Error ? err.message : String(err);
          yield {
            type: "error",
            error: engineError("session.promote_failed", errMsg, { cause: err }),
          };
          return;
        }
      } else {
        // Not in registry — check whether the session was discarded (not in DB either).
        const sessionExists = this.deps.db
          .select({ id: sessions.id })
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .get();
        if (!sessionExists) {
          throw new SessionDiscardedError(sessionId);
        }
      }
    }
    // ── Normal path (already-promoted or no registry) ─────────────────────────
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

    // Engine session lifecycle — get-or-create-and-swap via manager.
    const entry = await this.engineManager.acquire({
      sessionId,
      currentEngineId,
      mode,
      studentId,
      ...(sessionRow.courseId !== null && {
        courseId: brandId<"CourseId">(sessionRow.courseId),
      }),
      ...(sessionRow.assignmentId !== null &&
        sessionRow.assignmentId !== undefined && {
          assignmentId: brandId<"AssignmentId">(sessionRow.assignmentId),
        }),
    });

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
    yield* this._driveEngineTurn({ entry, sessionId, studentId, mode, message, signal });
  }

  /**
   * Drive the engine session for a single turn; persist every event.
   * Extracted so both the promote path and the normal path can share it.
   */
  private async *_driveEngineTurn(opts: {
    entry: ActiveEntry;
    sessionId: SessionId;
    studentId: StudentId;
    mode: Mode;
    message: string;
    signal?: AbortSignal | undefined;
  }): AsyncIterable<EngineEvent> {
    const { entry, sessionId, studentId, mode, message, signal } = opts;
    // Resolve the turn index from the DB (the user_message was already written).
    const turnIndex = nextTurnIndex(this.deps.db, sessionId) - 1;

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
    await this.engineManager.close(sessionId);

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

  async active(opts?: { modeId?: string }): Promise<SessionHandle | null> {
    const studentId = getOrCreateDefaultStudentId(this.deps.db);
    const conditions: ReturnType<typeof eq>[] = [
      eq(sessions.studentId, studentId),
      isNull(sessions.endedAt),
    ];
    if (opts?.modeId !== undefined) {
      conditions.push(eq(sessions.modeId, opts.modeId));
    }
    const row = this.deps.db
      .select()
      .from(sessions)
      .where(and(...conditions))
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

  async list(opts?: {
    includeEnded?: boolean;
    limit?: number;
    excludeModeIds?: string[];
  }): Promise<SessionSummary[]> {
    const studentId = getOrCreateDefaultStudentId(this.deps.db);
    const limit = opts?.limit ?? 100;
    const includeEnded = opts?.includeEnded ?? true;
    const excludeModeIds = opts?.excludeModeIds ?? [];

    const conditions: ReturnType<typeof eq>[] = [eq(sessions.studentId, studentId)];
    if (!includeEnded) {
      conditions.push(isNull(sessions.endedAt));
    }
    if (excludeModeIds.length > 0) {
      conditions.push(notInArray(sessions.modeId, excludeModeIds));
    }

    const rows = this.deps.db
      .select()
      .from(sessions)
      .where(and(...conditions))
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

    const entry = this.engineManager.get(input.sessionId);
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
    const handle = await this.start({
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
    const handle = await this.start({ modeId: "teach", _persistImmediately: true });

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

    // Start a teach session. _persistImmediately: true — this spawn path injects
    // an opening message before the student's first turn, so the session has meaning
    // before the student interacts.
    const handle = await this.start({ modeId: "teach", _persistImmediately: true });

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
    await this.engineManager.closeAll();
    // Phase 7: shut down the indexer orchestrator (clears all debounce timers).
    this.deps.indexerOrchestrator?.shutdown?.();
  }

  private requireMode(modeId: string): Mode {
    const mode = this.deps.modes.get(modeId);
    if (!mode) throw new Error(`Unknown mode: ${modeId}`);
    return mode;
  }
}
