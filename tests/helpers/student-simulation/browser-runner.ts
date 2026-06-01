import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import type {
  StudentSimulationArtifact,
  StudentSimulationResult,
  StudentSimulationScenario,
  StudentSimulationStepResult,
} from "@praxis/core/types";
import { getStudentSimulationFixture, STUDENT_SIMULATION_SCENARIOS } from "./scenarios/index.js";

export interface StudentSimulationBrowserRunnerInput {
  scenario: StudentSimulationScenario;
  outputDir: string;
  keepArtifacts?: boolean;
  headed?: boolean;
  appUrl?: string;
  page?: Page;
  runTimeoutMs?: number;
}

export interface StudentSimulationBrowserRunner {
  run(input: StudentSimulationBrowserRunnerInput): Promise<StudentSimulationResult>;
}

interface BrowserScenarioRunSummary {
  scenarioId: string;
  status: "passed" | "failed";
  bodyText: string;
  sessionIds: string[];
  callIds: string[];
  anomalies: string[];
}

export function listBrowserSimulationScenarios(): readonly StudentSimulationScenario[] {
  return STUDENT_SIMULATION_SCENARIOS.filter((scenario) => scenario.drivers.includes("browser"));
}

export function detectBrowserVisibleAnomalies(bodyText: string): string[] {
  return ["<invoke", "[object Object]"].filter((needle) => bodyText.includes(needle));
}

export class StudentSimulationBrowserRunnerImpl implements StudentSimulationBrowserRunner {
  async run(input: StudentSimulationBrowserRunnerInput): Promise<StudentSimulationResult> {
    const outputDir = resolve(input.outputDir);
    await mkdir(outputDir, { recursive: true });
    const resultPath = join(outputDir, "browser-result.json");
    const tracePath = join(outputDir, "trace.zip");
    const screenshotPath = join(outputDir, "screenshot.png");
    const domPath = join(outputDir, "dom.html");
    const consolePath = join(outputDir, "console.md");
    const consoleLines: string[] = [];
    const appUrl = resolveBrowserAppUrl(
      input.appUrl ?? process.env.PRAXIS_STUDENT_SIM_BROWSER_URL ?? "http://127.0.0.1:4177",
    );

    const ownedBrowser =
      input.page === undefined ? await chromium.launch({ headless: !input.headed }) : undefined;
    const page = input.page ?? (await ownedBrowser?.newPage());
    if (page === undefined) throw new Error("failed to create Playwright page");
    const context = page.context();
    page.on("console", (message) => {
      consoleLines.push(`[${message.type()}] ${message.text()}`);
    });

    let summary: BrowserScenarioRunSummary | undefined;
    let runError: string | undefined;
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    try {
      await page.goto(appUrl);
      await page.waitForFunction(
        () =>
          (
            globalThis as {
              __praxisStudentSimulation?: unknown;
            }
          ).__praxisStudentSimulation !== undefined,
      );
      summary = await withTimeout(
        page.evaluate(async (scenarioId) => {
          const api = (
            globalThis as {
              __praxisStudentSimulation?: {
                runScenario(id: string): Promise<BrowserScenarioRunSummary>;
              };
            }
          ).__praxisStudentSimulation;
          if (api === undefined) throw new Error("student simulation browser API not initialized");
          return api.runScenario(scenarioId);
        }, input.scenario.id),
        input.runTimeoutMs ?? 15_000,
        `Browser simulation ${input.scenario.id}`,
      );
    } catch (err) {
      runError = err instanceof Error ? err.message : String(err);
    }

    const bodyText =
      summary?.bodyText ??
      (await page
        .locator("body")
        .innerText()
        .catch(() => ""));
    const anomalies = [
      ...new Set([...(summary?.anomalies ?? []), ...detectBrowserVisibleAnomalies(bodyText)]),
    ];
    const status = runError === undefined && anomalies.length === 0 ? "passed" : "failed";
    const shouldCaptureEvidence = status === "failed" || input.keepArtifacts === true;
    if (shouldCaptureEvidence) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await writeFile(domPath, await page.content(), "utf8");
      await writeFile(consolePath, `${consoleLines.join("\n")}\n`, "utf8");
      await context.tracing.stop({ path: tracePath });
    } else {
      await context.tracing.stop();
    }
    await ownedBrowser?.close();

    const artifacts: StudentSimulationArtifact[] = [
      {
        kind: "json",
        path: resultPath,
        source: "renderer",
        description: "Browser simulation result",
      },
    ];
    if (shouldCaptureEvidence) {
      artifacts.push(
        {
          kind: "trace-zip",
          path: tracePath,
          source: "browser_trace",
          description: "Playwright trace",
        },
        {
          kind: "screenshot",
          path: screenshotPath,
          source: "renderer",
          description: "Final page screenshot",
        },
        { kind: "dom-excerpt", path: domPath, source: "renderer", description: "Captured DOM" },
        { kind: "markdown", path: consolePath, source: "renderer", description: "Console log" },
      );
    }

    const steps = buildStepResults(input.scenario, status, runError, anomalies);
    const result: StudentSimulationResult = {
      kind: "student_simulation_result",
      schemaVersion: 1,
      scenarioId: input.scenario.id,
      runId: `browser-${input.scenario.id}`,
      driver: "browser",
      determinism: input.scenario.determinism,
      status,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      summary:
        status === "passed"
          ? `Browser simulation passed for ${input.scenario.id}.`
          : `Browser simulation failed for ${input.scenario.id}: ${runError ?? anomalies.join(", ")}`,
      sessionIds: summary?.sessionIds ?? [],
      callIds: summary?.callIds ?? collectCallIds(input.scenario.id),
      rendererEventIds: [],
      steps,
      artifacts,
    };
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  }
}

function buildStepResults(
  scenario: StudentSimulationScenario,
  status: "passed" | "failed",
  runError: string | undefined,
  anomalies: readonly string[],
): StudentSimulationStepResult[] {
  if (status === "passed") {
    return scenario.steps.map((step, index) => ({ index, kind: step.kind, status: "passed" }));
  }
  const failedIndex = scenario.steps.findIndex(
    (step) => step.kind === "expect-visible" && anomalies.includes(step.text),
  );
  return scenario.steps.map((step, index) => ({
    index,
    kind: step.kind,
    status:
      index === (failedIndex >= 0 ? failedIndex : scenario.steps.length - 1) ? "failed" : "passed",
    ...(index === (failedIndex >= 0 ? failedIndex : scenario.steps.length - 1) && {
      observation: runError ?? `Visible anomaly detected: ${anomalies.join(", ")}`,
      error: runError ?? `Visible anomaly detected: ${anomalies.join(", ")}`,
    }),
  }));
}

function collectCallIds(scenarioId: string): string[] {
  const fixture = getStudentSimulationFixture(scenarioId);
  return [
    ...new Set(
      fixture.engineTurns.flatMap((turn) =>
        turn.events.flatMap((event) =>
          event.type === "tool_call" || event.type === "tool_result" ? [event.callId] : [],
        ),
      ),
    ),
  ];
}

function resolveBrowserAppUrl(base: string): string {
  return new URL("browser-app.html", base.endsWith("/") ? base : `${base}/`).toString();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--list")) {
  for (const scenario of listBrowserSimulationScenarios()) {
    console.log(`${scenario.id}\t${scenario.title}`);
  }
}
