import { join } from "node:path";
import { DebugTraceRegistryImpl } from "@praxis/core/services";
import { describe, expect, it } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import { createStudentSimulationClientRunner } from "./helpers/student-simulation/client-runner.js";
import { createInProcessSimulationClient } from "./helpers/student-simulation/in-process-client.js";
import {
  getStudentSimulationScenario,
  STUDENT_SIMULATION_FIXTURES,
  STUDENT_SIMULATION_SCENARIOS,
} from "./helpers/student-simulation/scenarios/index.js";

const db = useTempDb();

describe("student simulation scenario catalog", () => {
  it("lists deterministic scenarios and fails fast for unknown ids", () => {
    expect(STUDENT_SIMULATION_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "course-create-structured-question",
      "teach-quick-check-wrong-then-right",
      "mode-transition-assignment",
    ]);
    expect(getStudentSimulationScenario("course-create-structured-question").title).toBe(
      "Course-create structured question",
    );
    expect(() => getStudentSimulationScenario("missing-scenario")).toThrow(
      "Unknown student simulation scenario: missing-scenario",
    );
  });

  it("records client/browser support and scripted determinism", () => {
    for (const scenario of STUDENT_SIMULATION_SCENARIOS) {
      expect(scenario.drivers).toContain("client");
      expect(scenario.drivers).toContain("browser");
      expect(scenario.determinism).toBe("scripted");
    }
  });

  it("asserts raw tool markup is absent from the course-create visible transcript", () => {
    const scenario = getStudentSimulationScenario("course-create-structured-question");
    expect(scenario.steps).toContainEqual({
      kind: "expect-visible",
      text: "<invoke",
      absent: true,
    });
  });

  it("passes every deterministic fixture through the client runner", async () => {
    for (const fixture of STUDENT_SIMULATION_FIXTURES) {
      const debugTrace = new DebugTraceRegistryImpl({ now: () => 10_000, maxRecords: 10_000 });
      const client = await createInProcessSimulationClient({
        dbPath: db.dbPath,
        engineTurns: fixture.engineTurns,
        debugTrace,
        quickChecks: fixture.quickChecks,
      });

      const result = await createStudentSimulationClientRunner().run({
        scenario: fixture.scenario,
        client,
        outputDir: join(db.tmpDir, fixture.scenario.id),
        runId: `run-${fixture.scenario.id}`,
        debugTrace,
        now: () => new Date("2026-06-01T00:00:00.000Z"),
      });

      expect(result.status, fixture.scenario.id).toBe("passed");
      expect(result.driver).toBe("client");
      expect(result.determinism).toBe("scripted");
      expect(result.artifacts).toHaveLength(3);
    }
  });
});
