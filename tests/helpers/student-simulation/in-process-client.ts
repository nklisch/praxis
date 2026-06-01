import { resolve, sep } from "node:path";
import {
  brandId,
  type EngineEvent,
  makeTurnId,
  type PraxisClient,
  type QuickCheckEvent,
  type SessionHandle,
  type SessionId,
  type Timestamp,
} from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
import type { ReplayTurn } from "../replay-engine.js";
import type { ScriptedQuickCheck, ScriptedSimulationClientInput } from "./scripted-engine.js";

export async function createInProcessSimulationClient(
  input: ScriptedSimulationClientInput,
): Promise<PraxisClient> {
  assertSafeSimulationDbPath(input.dbPath);
  const quickCheckBus = new QuickCheckEventBus();
  const sessions = new Map<SessionId, SessionHandle & { endedAt?: Timestamp }>();
  const quickChecksByCallId = new Map(input.quickChecks?.map((check) => [check.callId, check]));
  const turnsByIndex = new Map(input.engineTurns.map((turn) => [turn.turnIndex, turn]));
  let nextTurnIndex = 0;

  const sessionApi: PraxisClient["session"] = {
    async start(opts: { modeId: string }): Promise<SessionHandle> {
      const sessionId = brandId<"SessionId">(`sim-session-${uuidv7()}`);
      const handle: SessionHandle = {
        sessionId,
        modeId: opts.modeId,
        startedAt: Date.now() as Timestamp,
      };
      sessions.set(sessionId, handle);
      return handle;
    },
    send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
      return sendScriptedTurn({
        sessionId,
        message,
        sessions,
        turnsByIndex,
        quickChecksByCallId,
        quickCheckBus,
        turnIndex: nextTurnIndex++,
        debugTrace: input.debugTrace,
      });
    },
    async end(sessionId: SessionId) {
      const session = loadSession(sessions, sessionId);
      const endedAt = Date.now() as Timestamp;
      sessions.set(sessionId, { ...session, endedAt });
      return {
        sessionId,
        endedAt,
        unlockedGates: [],
        newMisconceptions: 0,
      };
    },
    async active(opts?: { modeId?: string }) {
      for (const session of sessions.values()) {
        if (session.endedAt !== undefined) continue;
        if (opts?.modeId !== undefined && session.modeId !== opts.modeId) continue;
        return session;
      }
      return null;
    },
    async list() {
      return [...sessions.values()].map((session) => ({
        sessionId: session.sessionId,
        modeId: session.modeId,
        courseId: session.courseId,
        assignmentId: session.assignmentId,
        startedAt: session.startedAt,
        endedAt: session.endedAt ?? null,
      }));
    },
    async spawnFromAssignment() {
      throw new Error("student simulation client does not support spawnFromAssignment yet");
    },
    async spawnFromNote() {
      throw new Error("student simulation client does not support spawnFromNote yet");
    },
    async spawnFromPassage() {
      throw new Error("student simulation client does not support spawnFromPassage yet");
    },
    async discardIfUnpromoted() {
      return { discarded: false };
    },
  };

  return makeSimulationClient({
    session: sessionApi,
    quickCheck: {
      events: () => quickCheckBus.events(),
      resolve: async (resolution) => {
        quickCheckBus.emit({
          kind: "resolved",
          callId: resolution.callId,
          answer: resolution.answer,
        });
      },
    },
  });
}

export function assertSafeSimulationDbPath(dbPath: string): void {
  if (dbPath.trim().length === 0) {
    throw new Error("student simulation dbPath is required");
  }
  const normalized = resolve(dbPath);
  const devDbSuffix = `${sep}.praxis${sep}dev.db`;
  if (normalized.endsWith(devDbSuffix)) {
    throw new Error(`student simulation refuses to use the Praxis dev DB: ${normalized}`);
  }
}

function makeSimulationClient(input: {
  session: PraxisClient["session"];
  quickCheck: PraxisClient["quickCheck"];
}): PraxisClient {
  return {
    session: input.session,
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
    tabs: {} as PraxisClient["tabs"],
    sketches: {} as PraxisClient["sketches"],
    conceptMaps: {} as PraxisClient["conceptMaps"],
    documentScopes: {} as PraxisClient["documentScopes"],
    activity: {} as PraxisClient["activity"],
    drafts: {} as PraxisClient["drafts"],
    quickCheck: input.quickCheck,
    update: {} as PraxisClient["update"],
    subAgent: {} as PraxisClient["subAgent"],
    recommendations: {} as PraxisClient["recommendations"],
    citations: {} as PraxisClient["citations"],
    library: {} as PraxisClient["library"],
    progress: {} as PraxisClient["progress"],
    log: {
      record: () => {},
    },
  };
}

async function* sendScriptedTurn(input: {
  sessionId: SessionId;
  message: string;
  sessions: ReadonlyMap<SessionId, SessionHandle & { endedAt?: Timestamp }>;
  turnsByIndex: ReadonlyMap<number, ReplayTurn>;
  quickChecksByCallId: ReadonlyMap<string, ScriptedQuickCheck>;
  quickCheckBus: QuickCheckEventBus;
  turnIndex: number;
  debugTrace: ScriptedSimulationClientInput["debugTrace"];
}): AsyncIterable<EngineEvent> {
  const session = loadSession(input.sessions, input.sessionId);
  if (session.endedAt !== undefined) {
    yield {
      type: "error",
      error: {
        code: "session.ended",
        message: `Session ${input.sessionId} has ended`,
        recoverable: false,
      },
    };
    return;
  }
  const turn = input.turnsByIndex.get(input.turnIndex);
  if (turn === undefined) {
    throw new Error(`scripted simulation has no engine turn ${input.turnIndex}`);
  }
  if (turn.userMessage !== input.message) {
    throw new Error(
      `scripted simulation turn ${input.turnIndex} expected ${JSON.stringify(
        turn.userMessage,
      )}, received ${JSON.stringify(input.message)}`,
    );
  }

  const trace = {
    runId: "student-simulation-client",
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    turnId: makeTurnId(input.sessionId, input.turnIndex),
  };
  input.debugTrace.record({
    type: "turn_start",
    modeId: session.modeId,
    engineId: "scripted-simulation",
    trace,
  });

  const userMessage: EngineEvent = { type: "user_message", content: input.message };
  input.debugTrace.record({
    type: "engine_event",
    eventType: userMessage.type,
    summary: userMessage.type,
    trace,
  });
  yield userMessage;

  for (const event of turn.events) {
    const callId = getEventCallId(event);
    input.debugTrace.record({
      type: "engine_event",
      eventType: event.type,
      summary: summarizeEngineEvent(event),
      trace: callId === undefined ? trace : { ...trace, callId },
    });
    if (event.type === "tool_call") {
      const quickCheck = input.quickChecksByCallId.get(event.callId);
      if (quickCheck !== undefined) {
        input.quickCheckBus.emit({
          kind: "pending",
          callId: event.callId,
          sessionId: input.sessionId,
          item: quickCheck.item,
        });
      }
    }
    yield event;
  }
}

function loadSession(
  sessions: ReadonlyMap<SessionId, SessionHandle & { endedAt?: Timestamp }>,
  sessionId: SessionId,
): SessionHandle & { endedAt?: Timestamp } {
  const session = sessions.get(sessionId);
  if (session === undefined) throw new Error(`student simulation session not found: ${sessionId}`);
  return session;
}

function getEventCallId(event: EngineEvent): string | undefined {
  switch (event.type) {
    case "tool_call":
    case "tool_result":
      return event.callId;
    default:
      return undefined;
  }
}

function summarizeEngineEvent(event: EngineEvent): string {
  switch (event.type) {
    case "tool_call":
      return `${event.type}:${event.toolName}`;
    case "tool_result":
      return `${event.type}:${event.result.ok ? "ok" : "error"}`;
    case "final":
      return `${event.type}:${event.finalReason ?? "success"}`;
    default:
      return event.type;
  }
}

class QuickCheckEventBus {
  private readonly backlog: QuickCheckEvent[] = [];
  private readonly waiters = new Set<() => void>();

  emit(event: QuickCheckEvent): void {
    this.backlog.push(event);
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }

  async *events(): AsyncIterable<QuickCheckEvent> {
    let cursor = 0;
    while (true) {
      while (cursor < this.backlog.length) {
        const event = this.backlog[cursor];
        cursor++;
        if (event !== undefined) yield event;
      }
      await new Promise<void>((resolveWaiter) => {
        this.waiters.add(resolveWaiter);
      });
    }
  }
}
