import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StudentSimulationResult, StudentSimulationScenario } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { assertLiveSimulationAllowed, runStudentSimulationCli } from "../scripts/student-sim.js";
import {
  getFirstBadObservation,
  renderStudentSimulationReport,
} from "./helpers/student-simulation/report.js";
import { getStudentSimulationScenario } from "./helpers/student-simulation/scenarios/index.js";

describe("student simulation CLI", () => {
  it("lists deterministic scenarios without running them", async () => {
    const io = makeIo();
    const code = await runStudentSimulationCli(["list"], {}, io);

    expect(code).toBe(0);
    expect(io.stderrLines).toEqual([]);
    expect(io.stdoutText()).toContain("course-create-structured-question");
    expect(io.stdoutText()).toContain("scripted");
    expect(io.stdoutText()).toContain("client,browser");
  });

  it("runs a deterministic client scenario and writes a report", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "praxis-student-sim-cli-"));
    const io = makeIo();
    const code = await runStudentSimulationCli(
      [
        "run",
        "course-create-structured-question",
        "--out",
        outputDir,
        "--run",
        "cli-course-create",
      ],
      {},
      io,
    );

    expect(code).toBe(0);
    expect(io.stderrLines).toEqual([]);
    const result = JSON.parse(
      await readFile(join(outputDir, "simulation-result.json"), "utf8"),
    ) as StudentSimulationResult;
    expect(result.status).toBe("passed");
    expect(result.runId).toBe("cli-course-create");
    expect(result.driver).toBe("client");

    const report = await readFile(join(outputDir, "simulation-report.md"), "utf8");
    expect(report).toContain("Scenario: course-create-structured-question");
    expect(report).toContain("Persona: Hesitant nursing student");
    expect(report).toContain("Driver: client");
    expect(report).toContain("Determinism: scripted");
    expect(report).toContain("simulation-result.json");
  });

  it("refuses live/model-backed scenarios without the explicit env gate", () => {
    const liveScenario: StudentSimulationScenario = {
      ...getStudentSimulationScenario("course-create-structured-question"),
      determinism: "live",
    };

    expect(() => assertLiveSimulationAllowed(liveScenario, {})).toThrow(
      "PRAXIS_RUN_LIVE_SIMULATION=1",
    );
    expect(() =>
      assertLiveSimulationAllowed(liveScenario, { PRAXIS_RUN_LIVE_SIMULATION: "1" }),
    ).not.toThrow();
  });
});

describe("student simulation reports", () => {
  it("summarizes failures with correlation ids, artifacts, next step, and bundle command", () => {
    const scenario = getStudentSimulationScenario("course-create-structured-question");
    const result: StudentSimulationResult = {
      kind: "student_simulation_result",
      schemaVersion: 1,
      scenarioId: scenario.id,
      runId: "failed-run",
      driver: "client",
      determinism: "scripted",
      status: "failed",
      startedAt: "2026-06-01T00:00:00.000Z",
      finishedAt: "2026-06-01T00:00:01.000Z",
      summary: "failed",
      sessionIds: ["session-1"],
      callIds: ["call-1"],
      rendererEventIds: ["renderer-1"],
      steps: [
        { index: 0, kind: "start-session", status: "passed" },
        {
          index: 1,
          kind: "expect-visible",
          status: "failed",
          observation: "Text was visible but expected absent: <invoke",
          error: "raw tool markup leaked",
        },
      ],
      artifacts: [
        {
          kind: "json",
          path: "/tmp/student-sim/simulation-result.json",
          source: "simulation_step",
        },
      ],
    };

    const report = renderStudentSimulationReport({
      scenario,
      result,
      outputDir: "/tmp/student-sim",
      nextDebugStep: "Inspect renderer trace around call-1.",
    });

    expect(getFirstBadObservation(result)).toBe("Text was visible but expected absent: <invoke");
    expect(report).toContain("Run id: failed-run");
    expect(report).toContain("Sessions: session-1");
    expect(report).toContain("Tool calls: call-1");
    expect(report).toContain("Renderer events: renderer-1");
    expect(report).toContain("/tmp/student-sim/simulation-result.json");
    expect(report).toContain("Inspect renderer trace around call-1.");
    expect(report).toContain("pnpm debug:bundle");
    expect(report).toContain("--failure-class simulation");
    expect(report).toContain("--run failed-run");
    expect(report).toContain("--session session-1");
    expect(report).toContain("--call call-1");
  });
});

function makeIo() {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    cwd: process.cwd(),
    stdoutLines,
    stderrLines,
    stdout: (line: string) => stdoutLines.push(line),
    stderr: (line: string) => stderrLines.push(line),
    now: () => new Date("2026-06-01T00:00:00.000Z"),
    stdoutText: () => stdoutLines.join("\n"),
  };
}
