import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb, type PraxisDb } from "../../../db/index.js";
import type { EngineEvent, SessionId } from "../../../types/index.js";
import { makeTurnId } from "../../../types/index.js";
import { DebugBundleCaptureServiceImpl } from "../debug-bundle-capture-service.js";
import { DebugTraceRegistryImpl } from "../debug-trace-registry.js";

const dbCtx = useTempDb();

describe("DebugBundleCaptureServiceImpl", () => {
  it("captures session trace records and full episodic EngineEvent payloads", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const sessionId = insertSession(db, "session-capture-1");
    insertEvent(db, sessionId, 0, { type: "user_message", content: "Build a course" });
    const toolEventId = insertEvent(db, sessionId, 0, {
      type: "tool_call",
      toolName: "course.start_drafting",
      args: { title: "Pathophysiology" },
      callId: "call-draft",
    });
    insertEvent(db, sessionId, 0, {
      type: "final",
      usage: { inputTokens: 1, outputTokens: 1 },
      finalReason: "success",
    });

    const debugTrace = new DebugTraceRegistryImpl({ now: () => 1_000 });
    debugTrace.record({
      type: "turn_start",
      trace: {
        runId: "run-session",
        sessionId,
        turnId: makeTurnId(sessionId, 0),
        turnIndex: 0,
      },
      modeId: "course-create",
      engineId: "fake-engine",
    });
    debugTrace.record({
      type: "engine_event",
      trace: {
        runId: "run-session",
        sessionId,
        turnId: makeTurnId(sessionId, 0),
        turnIndex: 0,
        callId: "call-draft",
      },
      eventType: "tool_call",
      eventId: toolEventId,
      summary: "tool_call:course.start_drafting",
    });

    const result = await makeService(db, debugTrace).capture({
      sessionId,
      failureClass: "tool-dispatch",
      title: "Tool call leaked into chat",
    });

    expect(result.manifest.runId).toBe("run-session");
    expect(result.manifest.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining(["trace-records.jsonl", "engine-events.jsonl", "db-snapshot.json"]),
    );

    const traceRecords = await readJsonl(join(result.bundleDir, "trace-records.jsonl"));
    expect(traceRecords).toHaveLength(2);

    const engineEvents = await readJsonl(join(result.bundleDir, "engine-events.jsonl"));
    expect(engineEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: toolEventId,
          event: expect.objectContaining({
            type: "tool_call",
            toolName: "course.start_drafting",
            callId: "call-draft",
          }),
        }),
      ]),
    );

    const dbSnapshot = JSON.parse(
      await readFile(join(result.bundleDir, "db-snapshot.json"), "utf8"),
    );
    expect(dbSnapshot).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        tables: expect.arrayContaining([
          expect.objectContaining({ name: "sessions" }),
          expect.objectContaining({ name: "episodic_events" }),
        ]),
      }),
    );
  });

  it("captures a callId by widening to the surrounding turn slice", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const sessionId = insertSession(db, "session-capture-call");
    insertEvent(db, sessionId, 0, { type: "user_message", content: "Earlier turn" });
    insertEvent(db, sessionId, 1, { type: "user_message", content: "Start drafting" });
    insertEvent(db, sessionId, 1, {
      type: "tool_call",
      toolName: "course.start_drafting",
      args: { title: "Pathophysiology" },
      callId: "call-target",
    });
    insertEvent(db, sessionId, 1, {
      type: "tool_result",
      callId: "call-target",
      result: { ok: false, error: { code: "SQLITE", message: "FK failed", recoverable: false } },
    });
    insertEvent(db, sessionId, 2, { type: "user_message", content: "Later turn" });

    const debugTrace = new DebugTraceRegistryImpl({ now: () => 2_000 });
    debugTrace.record({
      type: "turn_start",
      trace: {
        runId: "run-call",
        sessionId,
        turnId: makeTurnId(sessionId, 1),
        turnIndex: 1,
      },
      modeId: "course-create",
      engineId: "fake-engine",
    });
    debugTrace.record({
      type: "tool_dispatch_start",
      trace: {
        runId: "run-call",
        sessionId,
        turnId: makeTurnId(sessionId, 1),
        turnIndex: 1,
        callId: "call-target",
      },
      toolName: "course.start_drafting",
    });
    debugTrace.record({
      type: "tool_dispatch_end",
      trace: {
        runId: "run-call",
        sessionId,
        turnId: makeTurnId(sessionId, 1),
        turnIndex: 1,
        callId: "call-target",
      },
      toolName: "course.start_drafting",
      ok: false,
      durationMs: 1,
    });

    const result = await makeService(db, debugTrace).capture({
      callId: "call-target",
      failureClass: "tool-dispatch",
      title: "Dispatch threw before sub-agent start",
    });

    const engineEvents = await readJsonl(join(result.bundleDir, "engine-events.jsonl"));
    expect(engineEvents.map((row) => field(row, "turnIndex"))).toEqual([1, 1, 1]);

    const toolDispatch = await readJsonl(join(result.bundleDir, "tool-dispatch.jsonl"));
    expect(toolDispatch).toEqual([
      expect.objectContaining({ type: "tool_dispatch_start", toolName: "course.start_drafting" }),
      expect.objectContaining({ type: "tool_dispatch_end", toolName: "course.start_drafting" }),
    ]);
  });

  it("captures a callId from episodic rows when trace records are unavailable", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const targetSessionId = insertSession(db, "session-call-no-trace");
    const unrelatedSessionId = insertSession(db, "session-call-unrelated");
    insertEvent(db, targetSessionId, 0, { type: "user_message", content: "Earlier turn" });
    insertEvent(db, targetSessionId, 1, { type: "user_message", content: "Start drafting" });
    insertEvent(db, targetSessionId, 1, {
      type: "tool_call",
      toolName: "course.start_drafting",
      args: { title: "Pathophysiology" },
      callId: "call-no-trace",
    });
    insertEvent(db, targetSessionId, 1, {
      type: "tool_result",
      callId: "call-no-trace",
      result: { ok: false, error: { code: "SQLITE", message: "FK failed", recoverable: false } },
    });
    insertEvent(db, targetSessionId, 2, { type: "user_message", content: "Later turn" });
    insertEvent(db, unrelatedSessionId, 0, {
      type: "user_message",
      content: "Unrelated session",
    });

    const result = await makeService(db).capture({
      callId: "call-no-trace",
      failureClass: "tool-dispatch",
      title: "Dispatch threw without live trace",
    });

    const engineEvents = await readJsonl(join(result.bundleDir, "engine-events.jsonl"));
    expect(engineEvents.map((row) => field(row, "sessionId"))).toEqual([
      targetSessionId,
      targetSessionId,
      targetSessionId,
    ]);
    expect(engineEvents.map((row) => field(row, "turnIndex"))).toEqual([1, 1, 1]);
  });

  it("records missing trace and log evidence without failing capture", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const sessionId = insertSession(db, "session-missing-trace");
    insertEvent(db, sessionId, 0, { type: "user_message", content: "hello" });

    const result = await makeService(db).capture({
      sessionId,
      failureClass: "agent-behavior",
      title: "No live trace registry",
    });

    expect(result.manifest.captureEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "evidence_missing", source: "trace" }),
        expect.objectContaining({ type: "evidence_missing", source: "log" }),
        expect.objectContaining({ type: "evidence_captured", source: "session_event" }),
      ]),
    );
  });

  it("captures only the requested turnId when trace records are unavailable", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const sessionId = insertSession(db, "session-turn-no-trace");
    insertEvent(db, sessionId, 0, { type: "user_message", content: "Earlier turn" });
    insertEvent(db, sessionId, 1, { type: "user_message", content: "Target turn" });

    const result = await makeService(db).capture({
      turnId: makeTurnId(sessionId, 1),
      failureClass: "agent-behavior",
      title: "Inspect one turn",
    });

    const engineEvents = await readJsonl(join(result.bundleDir, "engine-events.jsonl"));
    expect(engineEvents.map((row) => field(row, "turnIndex"))).toEqual([1]);
  });

  it("writes renderer outcome slices with correlation fields", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const sessionId = insertSession(db, "session-renderer");
    insertEvent(db, sessionId, 0, { type: "user_message", content: "Render this" });

    const debugTrace = new DebugTraceRegistryImpl({ now: () => 3_000 });
    debugTrace.record({
      type: "turn_start",
      trace: {
        runId: "run-renderer",
        sessionId,
        turnId: makeTurnId(sessionId, 0),
        turnIndex: 0,
      },
      modeId: "teach",
      engineId: "fake-engine",
    });
    debugTrace.record({
      type: "renderer_outcome",
      trace: {
        runId: "run-renderer",
        sessionId,
        turnId: makeTurnId(sessionId, 0),
        turnIndex: 0,
        callId: "call-render",
        rendererEventId: "renderer-event-1",
      },
      surface: "chat",
      eventType: "tool_result",
      outcome: "rendered",
    });

    const result = await makeService(db, debugTrace).capture({
      sessionId,
      failureClass: "ui-render",
      title: "Renderer crashed on tool result",
    });

    const rendererOutcomes = await readJsonl(join(result.bundleDir, "renderer-outcomes.jsonl"));
    expect(rendererOutcomes).toEqual([
      expect.objectContaining({
        type: "renderer_outcome",
        trace: expect.objectContaining({
          sessionId,
          callId: "call-render",
          rendererEventId: "renderer-event-1",
        }),
      }),
    ]);
    expect(result.manifest.correlation.rendererEventIds).toEqual(["renderer-event-1"]);
  });
});

function makeService(
  db: PraxisDb,
  debugTrace?: DebugTraceRegistryImpl,
): DebugBundleCaptureServiceImpl {
  return new DebugBundleCaptureServiceImpl({
    db,
    ...(debugTrace !== undefined && { debugTrace }),
    now: () => new Date("2026-06-01T00:00:00.000Z"),
    defaultOutputRoot: join(dbCtx.tmpDir, "bundles"),
  });
}

function insertSession(db: PraxisDb, id: string): SessionId {
  db.insert(sessions)
    .values({
      id,
      studentId: "student-1",
      modeId: "course-create",
      engineId: "fake-engine",
      startedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    .run();
  return id as SessionId;
}

function insertEvent(
  db: PraxisDb,
  sessionId: SessionId,
  turnIndex: number,
  event: EngineEvent,
): string {
  const id = `${sessionId}-event-${turnIndex}-${event.type}-${eventCallId(event) ?? "none"}`;
  db.insert(episodicEvents)
    .values({
      id,
      sessionId,
      studentId: "student-1",
      ts: new Date(`2026-06-01T00:00:0${turnIndex}.000Z`),
      engineId: "fake-engine",
      modeId: "course-create",
      turnIndex,
      eventJson: event,
    })
    .run();
  return id;
}

async function readJsonl(path: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  return text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line));
}

function field(record: unknown, key: string): unknown {
  if (typeof record !== "object" || record === null || Array.isArray(record)) return undefined;
  return (record as Record<string, unknown>)[key];
}

function eventCallId(event: EngineEvent): string | undefined {
  return "callId" in event ? event.callId : undefined;
}
