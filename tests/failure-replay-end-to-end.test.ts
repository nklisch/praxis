import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openDb, type PraxisDb } from "@praxis/core/db";
import { DebugBundleCaptureServiceImpl, DebugTraceRegistryImpl } from "@praxis/core/services";
import type { EngineEvent, SessionId } from "@praxis/core/types";
import { makeTurnId } from "@praxis/core/types";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { describe, expect, it } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import { ReplayEngine } from "./helpers/replay-engine.js";
import { replayDebugBundle } from "./helpers/replay-runner.js";

const dbCtx = useTempDb();

describe("failure replay harness", () => {
  it("replays a tool failure before sub-agent start from a captured bundle", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const sessionId = insertFailureSession(db);
    const debugTrace = makeFailureTrace(sessionId);
    const capture = await new DebugBundleCaptureServiceImpl({
      db,
      debugTrace,
      now: () => new Date("2026-06-01T00:00:00.000Z"),
      defaultOutputRoot: join(dbCtx.tmpDir, "bundles"),
    }).capture({
      sessionId,
      failureClass: "persistence",
      title: "course.start_drafting failed before sub-agent start",
      firstBadObservation: "tool.dispatch.error FOREIGN KEY constraint failed",
      nextDebugStep: "Inspect document_scopes snapshot and tool dispatch slice.",
    });

    const replay = await replayDebugBundle({
      bundleDir: capture.bundleDir,
      dbPath: join(dbCtx.tmpDir, "replay.db"),
    });

    expect(replay.yieldedEvents.map((event) => event.type)).toEqual([
      "user_message",
      "tool_call",
      "tool_result",
      "final",
    ]);
    expect(replay.yieldedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_result",
          callId: "call-before-subagent",
          result: expect.objectContaining({
            ok: false,
            error: expect.objectContaining({ message: "FOREIGN KEY constraint failed" }),
          }),
        }),
      ]),
    );
    expect(replay.traceRecords.map((record) => record.type)).toEqual(
      expect.arrayContaining(["turn_start", "engine_event"]),
    );
    expect(replay.manifest.captureEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "evidence_missing",
          source: "subagent",
        }),
      ]),
    );
    expect(replay.limitations).toEqual(
      expect.arrayContaining([expect.stringContaining("external model behavior")]),
    );
    expect(replay.episodicRows).toHaveLength(4);
  });

  it("ReplayEngine supports multi-turn maps and fails fast on missing turns", async () => {
    const engine = new ReplayEngine({
      turns: [
        {
          turnIndex: 0,
          userMessage: "first",
          events: [{ type: "final", usage: { inputTokens: 1, outputTokens: 1 } }],
        },
        {
          turnIndex: 1,
          userMessage: "second",
          events: [{ type: "model_message", content: "ok" }],
        },
      ],
    });
    const session = await engine.open({
      systemPrompt: "",
      tools: {
        list: () => [],
        dispatch: async () => ({ ok: true, value: null, tier: "deterministic" }),
      },
    });

    const secondTurn: EngineEvent[] = [];
    for await (const event of session.send("second", undefined, {
      runId: "run",
      sessionId: "session" as SessionId,
      turnIndex: 1,
    })) {
      secondTurn.push(event);
    }
    expect(secondTurn).toEqual([{ type: "model_message", content: "ok" }]);

    await expect(async () => {
      for await (const _event of session.send("missing", undefined, {
        runId: "run",
        sessionId: "session" as SessionId,
        turnIndex: 2,
      })) {
        // drain
      }
    }).rejects.toThrow("ReplayEngine has no recorded turn for turnIndex 2");
  });

  it("replay fails explicitly when required artifacts are missing", async () => {
    const bundleDir = join(dbCtx.tmpDir, "broken-bundle");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(
      join(bundleDir, "manifest.json"),
      `${JSON.stringify(makeManifest(), null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(bundleDir, "engine-events.jsonl"), "", "utf8");

    await expect(
      replayDebugBundle({ bundleDir, dbPath: join(dbCtx.tmpDir, "broken-replay.db") }),
    ).rejects.toMatchObject({
      code: "artifact_missing",
      name: "DebugBundleLoadError",
    });
  });
});

function insertFailureSession(db: PraxisDb): SessionId {
  const sessionId = "session-fk-before-subagent" as SessionId;
  db.insert(sessions)
    .values({
      id: sessionId,
      studentId: "student-1",
      modeId: "course-create",
      engineId: "fake-engine",
      startedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    .run();
  insertEvent(db, sessionId, "event-user", {
    type: "user_message",
    content: "Create a pathophysiology course",
  });
  insertEvent(db, sessionId, "event-tool-call", {
    type: "tool_call",
    toolName: "course.start_drafting",
    args: { title: "Pathophysiology for Nursing" },
    callId: "call-before-subagent",
  });
  insertEvent(db, sessionId, "event-tool-result", {
    type: "tool_result",
    callId: "call-before-subagent",
    result: {
      ok: false,
      error: {
        code: "SQLITE_CONSTRAINT_FOREIGNKEY",
        message: "FOREIGN KEY constraint failed",
        recoverable: false,
      },
    },
  });
  insertEvent(db, sessionId, "event-final", {
    type: "final",
    usage: { inputTokens: 1, outputTokens: 1 },
    finalReason: "max_turns",
  });
  return sessionId;
}

function insertEvent(db: PraxisDb, sessionId: SessionId, id: string, event: EngineEvent): void {
  db.insert(episodicEvents)
    .values({
      id,
      sessionId,
      studentId: "student-1",
      ts: new Date("2026-06-01T00:00:00.000Z"),
      engineId: "fake-engine",
      modeId: "course-create",
      turnIndex: 0,
      eventJson: event,
    })
    .run();
}

function makeFailureTrace(sessionId: SessionId): DebugTraceRegistryImpl {
  const debugTrace = new DebugTraceRegistryImpl({ now: () => 1_000 });
  const trace = {
    runId: "run-fk-before-subagent",
    sessionId,
    turnId: makeTurnId(sessionId, 0),
    turnIndex: 0,
  };
  debugTrace.record({
    type: "turn_start",
    trace,
    modeId: "course-create",
    engineId: "fake-engine",
  });
  debugTrace.record({
    type: "tool_dispatch_start",
    trace: { ...trace, callId: "call-before-subagent" },
    toolName: "course.start_drafting",
  });
  debugTrace.record({
    type: "tool_dispatch_end",
    trace: { ...trace, callId: "call-before-subagent" },
    toolName: "course.start_drafting",
    ok: false,
    durationMs: 1,
    summary: "FOREIGN KEY constraint failed",
  });
  debugTrace.record({
    type: "engine_event",
    trace: { ...trace, callId: "call-before-subagent" },
    eventType: "tool_result",
    eventId: "event-tool-result",
    summary: "tool_result:failure",
  });
  return debugTrace;
}

function makeManifest(): Record<string, unknown> {
  return {
    kind: "debug_evidence_bundle",
    schemaVersion: 1,
    runId: "broken",
    createdAt: "2026-06-01T00:00:00.000Z",
    localOnly: true,
    exportKind: "none",
    correlation: {
      turnIds: [],
      callIds: [],
      parentCallIds: [],
      streamIds: [],
      rendererEventIds: [],
    },
    artifacts: [
      {
        kind: "jsonl",
        path: "engine-events.jsonl",
        source: "session_event",
        capture: "full_local",
      },
    ],
    captureEvents: [],
    summary: { title: "Broken bundle", failureClass: "agent-behavior" },
  };
}
