import { episodicEvents, sessions } from "@praxis/memory/schema";
import { eq, max } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type { EngineEvent } from "../types/engine.js";

export interface AppendEpisodicInput {
  db: PraxisDb;
  sessionId: string;
  studentId: string;
  engineId: string;
  modeId: string;
  turnIndex: number;
  event: EngineEvent;
  ts?: Date;
}

/** Append a single episodic event. Returns the generated event ID. */
export function appendEpisodic(input: AppendEpisodicInput): string {
  const id = uuidv7();
  input.db
    .insert(episodicEvents)
    .values({
      id,
      sessionId: input.sessionId,
      studentId: input.studentId,
      ts: input.ts ?? new Date(),
      engineId: input.engineId,
      modeId: input.modeId,
      turnIndex: input.turnIndex,
      eventJson: input.event,
    })
    .run();
  return id;
}

export interface CreateSessionInput {
  db: PraxisDb;
  studentId: string;
  modeId: string;
  engineId: string;
  courseId?: string;
}

/** Insert a new session row. Returns the generated session ID. */
export function createSession(input: CreateSessionInput): string {
  const id = uuidv7();
  input.db
    .insert(sessions)
    .values({
      id,
      studentId: input.studentId,
      modeId: input.modeId,
      engineId: input.engineId,
      startedAt: new Date(),
      ...(input.courseId !== undefined && { courseId: input.courseId }),
    })
    .run();
  return id;
}

export function endSession(db: PraxisDb, sessionId: string): void {
  db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, sessionId)).run();
}

/**
 * Next turn index for a session — `max(turnIndex) + 1`, or 0 if no events yet.
 */
export function nextTurnIndex(db: PraxisDb, sessionId: string): number {
  const row = db
    .select({ maxTurn: max(episodicEvents.turnIndex) })
    .from(episodicEvents)
    .where(eq(episodicEvents.sessionId, sessionId))
    .get();
  const current = row?.maxTurn ?? null;
  return current === null ? 0 : current + 1;
}

export interface RecordUserMessageInput {
  db: PraxisDb;
  sessionId: string;
  studentId: string;
  engineId: string;
  modeId: string;
  turnIndex: number;
  content: string;
  ts?: Date;
}

/**
 * Append a user_message episodic event. The user's input is part of the
 * immutable transcript — recorded BEFORE handing off to the engine session.
 */
export function recordUserMessage(input: RecordUserMessageInput): string {
  return appendEpisodic({
    db: input.db,
    sessionId: input.sessionId,
    studentId: input.studentId,
    engineId: input.engineId,
    modeId: input.modeId,
    turnIndex: input.turnIndex,
    event: { type: "user_message", content: input.content },
    ...(input.ts !== undefined && { ts: input.ts }),
  });
}
