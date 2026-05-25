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
import { brandId, engineError } from "../types/index.js";
import { SessionDiscardedError } from "../types/session-discarded-error.js";
import { type ActiveEntry, EngineSessionManager } from "./session/engine-session-manager.js";
import { SessionPromoter } from "./session/session-promoter.js";
import type { UnpromotedSessionState } from "./session/session-promotion-registry.js";
import { SessionSpawner } from "./session/session-spawner.js";
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
  private readonly promoter: SessionPromoter | null;
  private readonly spawner: SessionSpawner;

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
      ...(deps.onEngineProcessSpawned !== undefined && {
        onEngineProcessSpawned: deps.onEngineProcessSpawned,
      }),
      ...(deps.onEngineProcessExited !== undefined && {
        onEngineProcessExited: deps.onEngineProcessExited,
      }),
    });
    this.promoter =
      deps.sessionPromotionRegistry !== undefined
        ? new SessionPromoter({
            db: deps.db,
            log: deps.log,
            registry: deps.sessionPromotionRegistry,
            persistSessionRow: (state) => this._persistSessionRow(state),
          })
        : null;
    this.spawner = new SessionSpawner({
      db: deps.db,
      log: deps.log,
      startSession: (opts) => this.start(opts),
      sendMessage: (sessionId, message) =>
        // biome-ignore lint/suspicious/noExplicitAny: engine send is async-iterable; drain it
        this.send(sessionId as any, message),
      documentScopes: deps.toolServices.documentScopes,
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
    if (this.promoter?.shouldPromote(sessionId)) {
      try {
        const promoted = this.promoter.promote(sessionId, message);
        yield { type: "user_message", content: message };
        const mode = this.requireMode(promoted.modeId);
        const currentEngineId = readEngineConfig(
          this.deps.db,
          this.deps.secretStorage,
          this.deps.log,
        ).engineId;
        const entry = await this.engineManager.acquire({
          sessionId,
          currentEngineId,
          mode,
          studentId: promoted.studentId,
          ...(promoted.courseId !== undefined && { courseId: promoted.courseId }),
          ...(promoted.assignmentId !== undefined && { assignmentId: promoted.assignmentId }),
        });
        yield* this._driveEngineTurn({
          entry,
          sessionId,
          studentId: promoted.studentId,
          mode,
          message,
          signal,
        });
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        yield {
          type: "error",
          error: engineError("session.promote_failed", errMsg, { cause: err }),
        };
        return;
      }
    }

    // ── Check for discarded session (registry present but session unknown) ────
    if (this.deps.sessionPromotionRegistry !== undefined) {
      const sessionExists = this.deps.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .get();
      if (!sessionExists) {
        throw new SessionDiscardedError(sessionId);
      }
    }

    // ── Normal path (already-promoted or no registry) ─────────────────────────
    const turnIndex = nextTurnIndex(this.deps.db, sessionId);
    const turnLog = this.deps.log.child({ component: "session-service", sessionId, turnIndex });
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
    const entry = await this.engineManager.acquire({
      sessionId,
      currentEngineId,
      mode,
      studentId,
      ...(sessionRow.courseId !== null && { courseId: brandId<"CourseId">(sessionRow.courseId) }),
      ...(sessionRow.assignmentId !== null && {
        assignmentId: brandId<"AssignmentId">(sessionRow.assignmentId),
      }),
    });

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
      ...(row.assignmentId !== null && {
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
        ...(row.courseId !== null && {
          courseId: brandId<"CourseId">(row.courseId),
        }),
        ...(row.assignmentId !== null && {
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
    return this.spawner.spawnFromAssignment(input);
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
    seedText?: string;
  }): Promise<SessionHandle> {
    return this.spawner.spawnFromNote(input);
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
    return this.spawner.spawnFromPassage(input);
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
