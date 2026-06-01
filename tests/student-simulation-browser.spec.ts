import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  listBrowserSimulationScenarios,
  StudentSimulationBrowserRunnerImpl,
} from "./helpers/student-simulation/browser-runner.js";
import { getStudentSimulationScenario } from "./helpers/student-simulation/scenarios/index.js";

test.describe("student simulation browser runner", () => {
  test.skip(
    process.env.PRAXIS_RUN_BROWSER_SIMULATION !== "1",
    "browser simulation is gated behind PRAXIS_RUN_BROWSER_SIMULATION=1",
  );

  test("lists browser-capable scenarios", () => {
    expect(listBrowserSimulationScenarios().map((scenario) => scenario.id)).toContain(
      "course-create-structured-question",
    );
  });

  test("captures browser evidence for a visual simulation", async ({ page, baseURL }) => {
    const outputDir = await mkdtemp(join(tmpdir(), "praxis-browser-sim-"));
    const runner = new StudentSimulationBrowserRunnerImpl();
    const result = await runner.run({
      scenario: getStudentSimulationScenario("course-create-structured-question"),
      outputDir,
      keepArtifacts: true,
      page,
      appUrl: baseURL ?? "http://127.0.0.1:4177",
    });

    expect(result.status).toBe("passed");
    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
      "json",
      "trace-zip",
      "screenshot",
      "dom-excerpt",
      "markdown",
    ]);
    const domArtifact = result.artifacts.find((artifact) => artifact.kind === "dom-excerpt");
    expect(domArtifact).toBeDefined();
    const dom = await readFile(domArtifact?.path ?? "", "utf8");
    expect(dom).not.toContain("<invoke");
    expect(dom).not.toContain("[object Object]");
  });
});
