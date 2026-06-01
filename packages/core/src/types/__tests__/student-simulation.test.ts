import { describe, expect, it } from "vitest";
import type {
  DebugBundleArtifact,
  StudentSimulationResult,
  StudentSimulationScenario,
} from "../index.js";

describe("student simulation types", () => {
  it("supports deterministic client scenarios and trace-linked results", () => {
    const scenario = {
      id: "teach-quick-check",
      title: "Teach quick check wrong then right",
      persona: {
        id: "hesitant-algebra-student",
        label: "Hesitant algebra student",
        traits: ["asks for reassurance", "makes sign mistakes"],
        wrongAnswerStyle: "misconception",
      },
      determinism: "scripted",
      drivers: ["client", "browser"],
      tags: ["quick-check"],
      steps: [
        { kind: "start-session", ref: "teach", modeId: "teach" },
        { kind: "send-message", sessionRef: "teach", text: "Teach me linear equations." },
        { kind: "answer-quick-check", strategy: "wrong" },
        { kind: "answer-quick-check", strategy: "right" },
      ],
      maxTurns: 4,
    } satisfies StudentSimulationScenario;

    const result = {
      kind: "student_simulation_result",
      schemaVersion: 1,
      scenarioId: scenario.id,
      runId: "sim-run-1",
      driver: "client",
      determinism: "scripted",
      status: "passed",
      startedAt: "2026-06-01T00:00:00.000Z",
      finishedAt: "2026-06-01T00:00:01.000Z",
      summary: "All scripted steps passed.",
      sessionIds: ["session-1"],
      callIds: ["call-1"],
      rendererEventIds: ["renderer-1"],
      steps: [
        { index: 0, kind: "start-session", status: "passed" },
        { index: 1, kind: "send-message", status: "passed", observation: "final event seen" },
      ],
      artifacts: [
        {
          kind: "jsonl",
          path: "simulation-steps.jsonl",
          source: "simulation_step",
          description: "Step transcript.",
        },
      ],
    } satisfies StudentSimulationResult;

    expect(result.scenarioId).toBe(scenario.id);
    expect(result.artifacts[0]?.source).toBe("simulation_step");
  });

  it("lets debug bundles point at simulation-step artifacts", () => {
    const artifact = {
      kind: "jsonl",
      path: "simulation-steps.jsonl",
      source: "simulation_step",
      capture: "full_local",
      description: "Synthetic student step transcript.",
    } satisfies DebugBundleArtifact;

    expect(artifact.source).toBe("simulation_step");
  });
});
