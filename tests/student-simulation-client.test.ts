import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DebugTraceRegistryImpl } from "@praxis/core/services";
import type { AssignmentItem, EngineEvent, StudentSimulationScenario } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import type { ReplayTurn } from "./helpers/replay-engine.js";
import {
  createStudentSimulationClientRunner,
  StudentSimulationClientRunnerImpl,
} from "./helpers/student-simulation/client-runner.js";
import { createInProcessSimulationClient } from "./helpers/student-simulation/in-process-client.js";
import { HESITANT_NURSING_STUDENT } from "./helpers/student-simulation/personas.js";

const db = useTempDb();

const QUICK_CHECK_ITEM: AssignmentItem = {
  kind: "single-choice",
  id: "qc-1",
  prompt: "Which value solves x + 1 = 3?",
  options: ["x = 1", "x = 2"],
  correctOptionIndex: 1,
};

const ENGINE_EVENTS: EngineEvent[] = [
  { type: "model_message", content: "Try this quick check.", partial: false },
  {
    type: "tool_call",
    toolName: "quick_check.single_choice",
    args: { itemId: "qc-1" },
    callId: "call-qc-1",
  },
  {
    type: "tool_result",
    callId: "call-qc-1",
    result: { ok: true, value: { queued: true }, tier: "deterministic" },
  },
  { type: "final", usage: { inputTokens: 4, outputTokens: 6 }, finalReason: "success" },
];

const TURN: ReplayTurn = {
  turnIndex: 0,
  userMessage: "Teach me a simple equation.",
  events: ENGINE_EVENTS,
};

function makeScenario(
  extraSteps: StudentSimulationScenario["steps"] = [],
): StudentSimulationScenario {
  return {
    id: "client-runner-smoke",
    title: "Client runner smoke",
    persona: HESITANT_NURSING_STUDENT,
    determinism: "scripted",
    drivers: ["client"],
    tags: ["smoke"],
    steps: [
      { kind: "start-session", ref: "teach", modeId: "teach" },
      { kind: "send-message", sessionRef: "teach", text: "Teach me a simple equation." },
      { kind: "answer-quick-check", strategy: "wrong" },
      { kind: "expect-event", sessionRef: "teach", eventType: "tool_call", callId: "call-qc-1" },
      ...extraSteps,
    ],
  };
}

describe("student simulation client runner", () => {
  it("runs a scripted scenario through a PraxisClient and writes artifacts", async () => {
    const debugTrace = new DebugTraceRegistryImpl({ now: () => 1_000, maxRecords: 10_000 });
    const client = await createInProcessSimulationClient({
      dbPath: db.dbPath,
      engineTurns: [TURN],
      debugTrace,
      quickChecks: [{ callId: "call-qc-1", item: QUICK_CHECK_ITEM }],
    });
    const runner = createStudentSimulationClientRunner();

    const result = await runner.run({
      scenario: makeScenario(),
      client,
      outputDir: join(db.tmpDir, "simulation-output"),
      runId: "run-client-smoke",
      debugTrace,
      now: () => new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.status).toBe("passed");
    expect(result.sessionIds).toHaveLength(1);
    expect(result.callIds).toContain("call-qc-1");
    expect(result.steps.map((step) => step.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(["json", "jsonl", "jsonl"]);

    const resultArtifact = JSON.parse(await readFile(result.artifacts[0]?.path ?? "", "utf8")) as {
      status: string;
    };
    expect(resultArtifact.status).toBe("passed");

    const eventLines = (await readFile(result.artifacts[1]?.path ?? "", "utf8"))
      .trim()
      .split(/\r?\n/);
    expect(eventLines.some((line) => line.includes('"quick_check_event"'))).toBe(true);
    expect(eventLines.some((line) => line.includes('"selectedIndex":0'))).toBe(true);

    const stepLines = (await readFile(result.artifacts[2]?.path ?? "", "utf8"))
      .trim()
      .split(/\r?\n/);
    expect(stepLines).toHaveLength(4);
  });

  it("records the first failing step with correlation ids", async () => {
    const debugTrace = new DebugTraceRegistryImpl({ now: () => 2_000, maxRecords: 10_000 });
    const client = await createInProcessSimulationClient({
      dbPath: db.dbPath,
      engineTurns: [TURN],
      debugTrace,
      quickChecks: [{ callId: "call-qc-1", item: QUICK_CHECK_ITEM }],
    });
    const runner = new StudentSimulationClientRunnerImpl();

    const result = await runner.run({
      scenario: makeScenario([
        {
          kind: "expect-event",
          sessionRef: "teach",
          eventType: "tool_result",
          callId: "missing-call",
        },
      ]),
      client,
      outputDir: join(db.tmpDir, "simulation-failure"),
      runId: "run-client-failure",
      debugTrace,
      now: () => new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.status).toBe("failed");
    expect(result.callIds).toContain("call-qc-1");
    const failure = result.steps.at(-1);
    expect(failure).toMatchObject({
      index: 4,
      kind: "expect-event",
      status: "failed",
    });
    expect(failure?.error).toContain("Expected event tool_result with callId missing-call");
    expect(failure?.observation).toContain("sessions=sim-session-");
    expect(failure?.observation).toContain("calls=call-qc-1");
  });

  it("fails instead of hanging when no quick check is pending", async () => {
    const debugTrace = new DebugTraceRegistryImpl({ now: () => 3_000, maxRecords: 10_000 });
    const client = await createInProcessSimulationClient({
      dbPath: db.dbPath,
      engineTurns: [
        {
          turnIndex: 0,
          userMessage: "Just explain it.",
          events: [{ type: "final", usage: { inputTokens: 1, outputTokens: 1 } }],
        },
      ],
      debugTrace,
    });

    const result = await createStudentSimulationClientRunner().run({
      scenario: {
        id: "client-runner-no-pending-quick-check",
        title: "Client runner no pending quick check",
        persona: HESITANT_NURSING_STUDENT,
        determinism: "scripted",
        drivers: ["client"],
        tags: ["failure"],
        steps: [
          { kind: "start-session", ref: "teach", modeId: "teach" },
          { kind: "send-message", sessionRef: "teach", text: "Just explain it." },
          { kind: "answer-quick-check", strategy: "right" },
        ],
      },
      client,
      outputDir: join(db.tmpDir, "simulation-no-pending"),
      runId: "run-client-no-pending",
      debugTrace,
      now: () => new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.status).toBe("failed");
    expect(result.steps.at(-1)).toMatchObject({
      index: 2,
      kind: "answer-quick-check",
      status: "failed",
    });
    expect(result.steps.at(-1)?.error).toContain("Timed out waiting for quick-check event");
  });

  it("refuses to use the local dev database", async () => {
    const debugTrace = new DebugTraceRegistryImpl({ maxRecords: 10_000 });
    await expect(
      createInProcessSimulationClient({
        dbPath: join(process.cwd(), ".praxis", "dev.db"),
        engineTurns: [],
        debugTrace,
      }),
    ).rejects.toThrow("refuses to use the Praxis dev DB");
  });
});
