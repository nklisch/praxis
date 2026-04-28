import type { PraxisDb } from "../db/index.js";
import type { Brief, Engine, EngineEvent, Mode, ToolRegistry } from "../types/index.js";
import { appendEpisodic, createSession, endSession } from "./episodic.js";

export interface SessionRunnerOptions {
  db: PraxisDb;
  studentId: string;
  mode: Mode;
  engine: Engine;
  tools: ToolRegistry;
  courseId?: string;
}

export interface RunTurnOptions {
  brief: Brief;
  /** Existing session ID; if omitted a new session is created. */
  sessionId?: string;
  turnIndex?: number;
}

export interface RunTurnResult {
  sessionId: string;
  turnIndex: number;
  events: EngineEvent[];
  finalEvent?: Extract<EngineEvent, { type: "final" }>;
  error?: Extract<EngineEvent, { type: "error" }>;
}

/**
 * Orchestrates one turn end-to-end: creates (or reuses) a session, runs the
 * engine against the brief, intercepts every event, persists each as an
 * immutable episodic row, and yields the same events to the caller for UI use.
 *
 * Persistence is fire-and-forget per event (synchronous SQLite write). On a
 * write failure we emit an `error` event to the consumer but continue draining
 * the engine — losing the transcript is bad, but losing the rest of the answer
 * is worse.
 */
export class SessionRunner {
  constructor(private readonly opts: SessionRunnerOptions) {}

  /** Run a single turn. Yields events as they arrive; resolves to a RunTurnResult. */
  async *runTurn(input: RunTurnOptions): AsyncGenerator<EngineEvent, RunTurnResult> {
    const sessionId =
      input.sessionId ??
      createSession({
        db: this.opts.db,
        studentId: this.opts.studentId,
        modeId: this.opts.mode.id,
        engineId: this.opts.engine.id,
        ...(this.opts.courseId !== undefined && { courseId: this.opts.courseId }),
      });
    const turnIndex = input.turnIndex ?? 0;
    const events: EngineEvent[] = [];
    let finalEvent: Extract<EngineEvent, { type: "final" }> | undefined;
    let errorEvent: Extract<EngineEvent, { type: "error" }> | undefined;

    for await (const event of this.opts.engine.run(input.brief, this.opts.tools)) {
      events.push(event);
      try {
        appendEpisodic({
          db: this.opts.db,
          sessionId,
          studentId: this.opts.studentId,
          engineId: this.opts.engine.id,
          modeId: this.opts.mode.id,
          turnIndex,
          event,
        });
      } catch (cause) {
        const writeError: EngineEvent = {
          type: "error",
          error: {
            code: "episodic.write_failed",
            message: cause instanceof Error ? cause.message : String(cause),
            recoverable: false,
            cause,
          },
        };
        yield writeError;
        // Do NOT persist the write-failure event itself (would loop). Keep draining.
      }
      if (event.type === "final") finalEvent = event;
      if (event.type === "error") errorEvent = event;
      yield event;
    }
    if (this.opts.mode.onTurnEnd) {
      await this.opts.mode.onTurnEnd(events, { brief: input.brief });
    }
    return {
      sessionId,
      turnIndex,
      events,
      ...(finalEvent !== undefined && { finalEvent }),
      ...(errorEvent !== undefined && { error: errorEvent }),
    };
  }

  /** Mark a session ended. Idempotent. */
  endSession(sessionId: string): void {
    endSession(this.opts.db, sessionId);
  }
}
