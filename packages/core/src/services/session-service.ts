import { composeSystemPrompt } from "@praxis/curriculum/brief";
import { composeCourseContextFragment } from "@praxis/curriculum/brief/course-context";
import { createEngine } from "@praxis/engines";
import { sessions } from "@praxis/memory/schema";
import { InProcessToolRegistry } from "@praxis/tools";
import { and, desc, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { readEngineConfig } from "../config/index.js";
import { appendEpisodic, nextTurnIndex, recordUserMessage } from "../session/episodic.js";
import { loadConversationHistory } from "../session/history.js";
import type {
  ConversationTurn,
  CourseId,
  Engine,
  EngineEvent,
  EngineSession,
  Mode,
  SessionHandle,
  SessionId,
  SessionService,
  SessionSummary,
  StudentId,
  Timestamp,
  ToolContext,
} from "../types/index.js";
import { brandId, engineError } from "../types/index.js";
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

  async start(opts: { courseId?: CourseId; modeId: string }): Promise<SessionHandle> {
    const mode = this.requireMode(opts.modeId);
    const studentId = getOrCreateDefaultStudentId(this.deps.db);
    const engineConfig = readEngineConfig(this.deps.db);
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
    });

    return {
      sessionId: brandId<"SessionId">(sessionId),
      modeId: mode.id,
      startedAt: startedAt.getTime() as Timestamp,
      ...(opts.courseId !== undefined && { courseId: opts.courseId }),
    };
  }

  async *send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
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
    const currentEngineId = readEngineConfig(this.deps.db).engineId;

    // Engine swap detection + reopen.
    let entry = this.activeSessions.get(sessionId);
    if (entry && entry.engineId !== currentEngineId) {
      this.deps.log.info("engine swap detected; closing active session", {
        sessionId,
        from: entry.engineId,
        to: currentEngineId,
      });
      await entry.handle.close().catch(() => {});
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
      });
    }

    const turnIndex = nextTurnIndex(this.deps.db, sessionId);

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
    try {
      for await (const event of capturedEntry.handle.send(message)) {
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
      }
    } catch (cause) {
      const errMsg = cause instanceof Error ? cause.message : String(cause);
      yield { type: "error", error: engineError("engine.send_failed", errMsg, { cause }) };
    }
  }

  async end(sessionId: SessionId): Promise<SessionSummary> {
    const entry = this.activeSessions.get(sessionId);
    if (entry) {
      await entry.handle.close().catch(() => {});
      this.activeSessions.delete(sessionId);
    }
    const endedAt = new Date();
    this.deps.db.update(sessions).set({ endedAt }).where(eq(sessions.id, sessionId)).run();
    return {
      sessionId,
      endedAt: endedAt.getTime() as Timestamp,
      unlockedGates: [],
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
    };
  }

  /** Tear down all active engine sessions. Called on host shutdown. */
  async shutdown(): Promise<void> {
    const entries = [...this.activeSessions.values()];
    this.activeSessions.clear();
    await Promise.all(entries.map((e) => e.handle.close().catch(() => {})));
  }

  private async openActive(args: {
    sessionId: string;
    engineId: string;
    mode: Mode;
    studentId: string;
    priorTurns: ConversationTurn[];
    courseId?: CourseId;
  }): Promise<ActiveEntry> {
    const engineConfig = readEngineConfig(this.deps.db);
    const factory = this.deps.engineFactory ?? ((c, d) => createEngine({ config: c, deps: d }));
    const engine = factory(engineConfig, { log: this.deps.log });

    // Phase 6: inject course-context override when a courseId is set.
    let overrides: ReadonlyMap<string, string> | undefined;

    if (args.courseId && this.deps.toolServices.courseState) {
      const snapshot = await this.deps.toolServices.courseState.read({
        studentId: args.studentId as StudentId,
        courseId: args.courseId,
      });
      if (snapshot) {
        const fragment = composeCourseContextFragment(snapshot);
        // Use the overrides map so the existing "context.course-state" fragment
        // (which is customizable: true) is replaced by the dynamic course content.
        overrides = new Map([[fragment.id, fragment.template]]);
      }
    }

    const systemPrompt = composeSystemPrompt({
      mode: args.mode,
      ...(overrides !== undefined && { overrides }),
    });

    const toolContext: ToolContext = {
      studentId: args.studentId as ToolContext["studentId"],
      sessionId: args.sessionId as ToolContext["sessionId"],
      ...(args.courseId !== undefined && { courseId: args.courseId }),
      services: {
        memory: null,
        artifacts: this.deps.toolServices.artifacts, // ← Phase 6
        bootstrap: this.deps.toolServices.bootstrap, // ← Phase 6
        courseState: this.deps.toolServices.courseState, // ← Phase 6
        vectorStore: this.deps.toolServices.vectorStore,
        ftsStore: this.deps.toolServices.ftsStore,
        embeddings: this.deps.toolServices.embeddings,
        documents: this.deps.toolServices.documents,
        sandbox: this.deps.toolServices.sandbox,
        sympy: this.deps.toolServices.sympy,
        pedagogyPack: null,
      },
      log: this.deps.log,
    };

    // Phase 4: filter toolDefinitions by mode.toolNames.
    const enabledNames = new Set(args.mode.toolNames);
    const enabledTools =
      enabledNames.size === 0
        ? this.deps.toolDefinitions // empty array means "all available" for backward compat
        : this.deps.toolDefinitions.filter((t) => enabledNames.has(t.name));

    const tools = new InProcessToolRegistry({
      tools: enabledTools,
      context: toolContext,
    });

    const handle = await engine.open({
      systemPrompt,
      tools,
      ...(args.priorTurns.length > 0 && { priorTurns: args.priorTurns }),
    });

    const entry: ActiveEntry = {
      sessionId: args.sessionId,
      engineId: args.engineId,
      mode: args.mode,
      handle,
      engine,
    };
    this.activeSessions.set(args.sessionId, entry);
    return entry;
  }

  private requireMode(modeId: string): Mode {
    const mode = this.deps.modes.get(modeId);
    if (!mode) throw new Error(`Unknown mode: ${modeId}`);
    return mode;
  }
}
