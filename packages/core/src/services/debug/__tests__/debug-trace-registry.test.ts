import { describe, expect, it } from "vitest";
import { makeTurnId, type SessionId } from "../../../types/index.js";
import { DebugTraceRegistryImpl } from "../debug-trace-registry.js";

function sid(value: string): SessionId {
  return value as SessionId;
}

describe("makeTurnId", () => {
  it("is deterministic for a session id and turn index", () => {
    const sessionId = sid("session-1");

    expect(makeTurnId(sessionId, 3)).toBe("session-1:turn:3");
    expect(makeTurnId(sessionId, 3)).toBe(makeTurnId(sessionId, 3));
    expect(makeTurnId(sessionId, 4)).not.toBe(makeTurnId(sessionId, 3));
  });

  it("rejects invalid turn indexes", () => {
    expect(() => makeTurnId(sid("session-1"), -1)).toThrow(
      "turnIndex must be a non-negative integer",
    );
    expect(() => makeTurnId(sid("session-1"), 1.5)).toThrow(
      "turnIndex must be a non-negative integer",
    );
  });
});

describe("DebugTraceRegistryImpl", () => {
  it("records compact trace records with timestamps", () => {
    const registry = new DebugTraceRegistryImpl({ now: () => 1234 });
    const record = registry.record({
      type: "turn_start",
      trace: {
        runId: "run-1",
        sessionId: sid("session-1"),
        turnId: makeTurnId(sid("session-1"), 0),
        turnIndex: 0,
        callId: "call-1",
        parentCallId: "parent-call-1",
        streamId: "stream-1",
        rendererEventId: "renderer-event-1",
      },
      modeId: "teach",
      engineId: "direct",
      summary: "started turn",
      artifacts: [{ id: "artifact-1", label: "trace summary" }],
    });

    expect(record).toMatchObject({
      type: "turn_start",
      modeId: "teach",
      engineId: "direct",
      recordedAt: 1234,
      trace: {
        runId: "run-1",
        sessionId: "session-1",
        turnId: "session-1:turn:0",
        turnIndex: 0,
        callId: "call-1",
        parentCallId: "parent-call-1",
        streamId: "stream-1",
        rendererEventId: "renderer-event-1",
      },
    });
    expect(registry.list()).toEqual([record]);
  });

  it("queries by runId, sessionId, and turnId", () => {
    const registry = new DebugTraceRegistryImpl({ now: () => 1 });
    const sessionA = sid("session-a");
    const sessionB = sid("session-b");
    const turnA0 = makeTurnId(sessionA, 0);
    const turnA1 = makeTurnId(sessionA, 1);

    registry.record({
      type: "engine_event",
      trace: { runId: "run-1", sessionId: sessionA, turnId: turnA0 },
      eventType: "assistant_message",
    });
    registry.record({
      type: "tool_dispatch_start",
      trace: { runId: "run-1", sessionId: sessionA, turnId: turnA1, callId: "call-1" },
      toolName: "document.search",
    });
    registry.record({
      type: "renderer_outcome",
      trace: { runId: "run-2", sessionId: sessionB },
      surface: "chat",
      outcome: "rendered",
    });

    expect(registry.findByRunId("run-1").map((record) => record.type)).toEqual([
      "engine_event",
      "tool_dispatch_start",
    ]);
    expect(registry.findBySessionId(sessionA).map((record) => record.type)).toEqual([
      "engine_event",
      "tool_dispatch_start",
    ]);
    expect(registry.findByTurnId(turnA1).map((record) => record.type)).toEqual([
      "tool_dispatch_start",
    ]);
  });

  it("evicts older records and preserves the newest bounded window", () => {
    const registry = new DebugTraceRegistryImpl({ now: () => 1, maxRecords: 2 });
    const sessionId = sid("session-1");

    registry.record({
      type: "engine_event",
      trace: { runId: "run-1", sessionId, turnId: makeTurnId(sessionId, 0) },
      eventType: "first",
    });
    registry.record({
      type: "engine_event",
      trace: { runId: "run-1", sessionId, turnId: makeTurnId(sessionId, 1) },
      eventType: "second",
    });
    registry.record({
      type: "engine_event",
      trace: { runId: "run-1", sessionId, turnId: makeTurnId(sessionId, 2) },
      eventType: "third",
    });

    expect(
      registry.list().map((record) => record.type === "engine_event" && record.eventType),
    ).toEqual(["second", "third"]);
    expect(registry.findByTurnId(makeTurnId(sessionId, 0))).toEqual([]);
  });

  it("rejects invalid retention limits instead of creating unbounded retention", () => {
    expect(() => new DebugTraceRegistryImpl({ maxRecords: 0 })).toThrow(
      "debug trace maxRecords must be a positive integer",
    );
    expect(() => new DebugTraceRegistryImpl({ maxRecords: Number.POSITIVE_INFINITY })).toThrow(
      "debug trace maxRecords must be a positive integer",
    );
  });

  it("clear removes retained records", () => {
    const registry = new DebugTraceRegistryImpl({ now: () => 1 });
    registry.record({
      type: "ipc_stream_event",
      trace: { runId: "run-1", sessionId: sid("session-1"), streamId: "stream-1" },
      channel: "praxis.session.send",
      eventType: "event",
      eventCount: 1,
    });

    registry.clear();

    expect(registry.list()).toEqual([]);
  });
});
