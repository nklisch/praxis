import { episodicEvents, sessions } from "@praxis/memory/schema";
import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage, noopDocumentScopes } from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import type { DebugTraceContext, Engine, EngineEvent, SessionId } from "../../types/index.js";
import { brandId, makeTurnId } from "../../types/index.js";
import { DebugTraceRegistryImpl } from "../debug/debug-trace-registry.js";
import { SessionServiceImpl } from "../session-service.js";
import { getOrCreateDefaultStudentId } from "../student.js";
import type { ServiceDeps } from "../types.js";

const dbCtx = useTempDb();

function makeLog() {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => log),
  };
  return log;
}

function makeMode(id: string) {
  return {
    id,
    label: id,
    displayName: id,
    description: "",
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [],
    promptFragments: [],
  };
}

function makeFakeEngine(events: EngineEvent[]): { engine: Engine; traces: DebugTraceContext[] } {
  const traces: DebugTraceContext[] = [];
  const fakeEngineHandle = {
    id: "fake-handle",
    send: vi.fn().mockImplementation(async function* (
      _msg: string,
      _signal?: AbortSignal,
      trace?: DebugTraceContext,
    ) {
      if (trace !== undefined) traces.push(trace);
      for (const event of events) yield event;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const engine: Engine = {
    id: "fake-engine",
    kind: "looped" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn().mockResolvedValue(fakeEngineHandle),
  } as unknown as Engine;

  return { engine, traces };
}

function makeService(
  db: ReturnType<typeof openDb>["db"],
  engine: Engine,
  debugTrace: DebugTraceRegistryImpl,
): SessionServiceImpl {
  const deps: ServiceDeps = {
    db,
    log: makeLog(),
    modes: new Map([["teach", makeMode("teach")]]),
    toolDefinitions: [],
    toolServices: {
      documentScopes: noopDocumentScopes(),
      // biome-ignore lint/suspicious/noExplicitAny: send path only needs documentScopes in this test
    } as any,
    lockService: {
      isSet: async () => false,
      isUnlocked: async () => true,
      setLockCode: async () => {},
      unlock: async () => ({ ok: true }),
      lock: async () => {},
      clearLock: async () => {},
    },
    engineFactory: () => engine,
    secretStorage: inMemorySecretStorage(),
    debugTrace,
  };

  return new SessionServiceImpl(deps);
}

function insertSession(db: ReturnType<typeof openDb>["db"], studentId: string): SessionId {
  const id = uuidv7();
  db.insert(sessions)
    .values({
      id,
      studentId,
      modeId: "teach",
      engineId: "fake-engine",
      startedAt: new Date(),
    })
    .run();
  return brandId<"SessionId">(id);
}

describe("SessionServiceImpl debug trace correlation", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: string;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("records turn_start and compact engine_event records with episodic event ids", async () => {
    const engineEvents: EngineEvent[] = [
      { type: "tool_call", toolName: "test.echo", args: { text: "hello" }, callId: "call-1" },
      {
        type: "tool_result",
        callId: "call-1",
        result: { ok: true, value: { echoed: "hello" }, tier: "deterministic" },
      },
      { type: "final", usage: { inputTokens: 1, outputTokens: 1 }, finalReason: "success" },
    ];
    const { engine, traces } = makeFakeEngine(engineEvents);
    const debugTrace = new DebugTraceRegistryImpl();
    const svc = makeService(db, engine, debugTrace);
    const sessionId = insertSession(db, studentId);

    const yielded: EngineEvent[] = [];
    for await (const event of svc.send(sessionId, "hello")) {
      yielded.push(event);
    }

    expect(yielded.map((event) => event.type)).toEqual([
      "user_message",
      "tool_call",
      "tool_result",
      "final",
    ]);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      sessionId,
      turnIndex: 0,
      turnId: makeTurnId(sessionId, 0),
    });
    expect(traces[0]?.runId).toEqual(expect.any(String));

    const records = debugTrace.list();
    const turnStart = records.find((record) => record.type === "turn_start");
    expect(turnStart).toMatchObject({
      type: "turn_start",
      modeId: "teach",
      trace: {
        runId: traces[0]?.runId,
        sessionId,
        turnIndex: 0,
        turnId: makeTurnId(sessionId, 0),
      },
    });

    const episodicRows = db
      .select({ id: episodicEvents.id, eventJson: episodicEvents.eventJson })
      .from(episodicEvents)
      .where(eq(episodicEvents.sessionId, sessionId))
      .orderBy(asc(episodicEvents.ts))
      .all();
    const toolCallRow = episodicRows.find((row) => {
      const event = row.eventJson as EngineEvent;
      return event.type === "tool_call";
    });
    if (!toolCallRow) throw new Error("expected tool_call episodic row");

    const toolCallTrace = records.find(
      (record) => record.type === "engine_event" && record.eventType === "tool_call",
    );
    expect(toolCallTrace).toMatchObject({
      type: "engine_event",
      eventType: "tool_call",
      eventId: toolCallRow.id,
      summary: "tool_call:test.echo",
      trace: {
        runId: traces[0]?.runId,
        sessionId,
        turnIndex: 0,
        turnId: makeTurnId(sessionId, 0),
        callId: "call-1",
      },
    });

    const finalTrace = records.find(
      (record) => record.type === "engine_event" && record.eventType === "final",
    );
    expect(finalTrace).toMatchObject({
      type: "engine_event",
      summary: "final:success",
      trace: {
        runId: traces[0]?.runId,
        sessionId,
        turnIndex: 0,
        turnId: makeTurnId(sessionId, 0),
      },
    });
  });
});
