#!/usr/bin/env tsx
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StudentSimulationScenario } from "@praxis/core/types";
import {
  listBrowserSimulationScenarios,
  StudentSimulationBrowserRunnerImpl,
} from "../tests/helpers/student-simulation/browser-runner.js";
import { renderStudentSimulationReport } from "../tests/helpers/student-simulation/report.js";
import { getStudentSimulationScenario } from "../tests/helpers/student-simulation/scenarios/index.js";

interface BrowserCliIo {
  cwd: string;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

type BrowserCliEnv = Readonly<Record<string, string | undefined>>;

export async function runStudentSimulationBrowserCli(
  args: readonly string[],
  env: BrowserCliEnv = process.env,
  io: BrowserCliIo = defaultIo(),
): Promise<number> {
  try {
    const command = args[0] ?? "help";
    if (command === "help" || command === "--help" || command === "-h") {
      io.stdout(usage());
      return 0;
    }
    if (command === "list") {
      for (const scenario of listBrowserSimulationScenarios()) {
        io.stdout(`${scenario.id}\t${scenario.determinism}\tbrowser\t${scenario.title}`);
      }
      return 0;
    }
    if (command === "run") {
      return await runBrowserScenario(args.slice(1), env, io);
    }
    throw new Error(`Unknown browser simulation command: ${command}`);
  } catch (err) {
    io.stderr(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export function assertBrowserSimulationAllowed(
  scenario: StudentSimulationScenario,
  env: BrowserCliEnv = process.env,
): void {
  if (!scenario.drivers.includes("browser")) {
    throw new Error(`Scenario ${scenario.id} does not support the browser driver.`);
  }
  if (env.PRAXIS_RUN_BROWSER_SIMULATION === "1") return;
  throw new Error(
    `Scenario ${scenario.id} uses browser automation. Set PRAXIS_RUN_BROWSER_SIMULATION=1 to run it.`,
  );
}

async function runBrowserScenario(
  args: readonly string[],
  env: BrowserCliEnv,
  io: BrowserCliIo,
): Promise<number> {
  const scenarioId = args.find((arg) => !arg.startsWith("--"));
  if (scenarioId === undefined) throw new Error("Missing scenario id.");
  const scenario = getStudentSimulationScenario(scenarioId);
  assertBrowserSimulationAllowed(scenario, env);
  const outputDir = resolve(
    io.cwd,
    valueAfter(args, "--out") ??
      join(
        io.cwd,
        ".tmp",
        "student-sim-browser",
        `${Date.now()}-${scenarioId.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`,
      ),
  );
  await mkdir(outputDir, { recursive: true });
  const result = await new StudentSimulationBrowserRunnerImpl().run({
    scenario,
    outputDir,
    keepArtifacts: true,
    ...(valueAfter(args, "--app-url") !== undefined && { appUrl: valueAfter(args, "--app-url") }),
    headed: args.includes("--headed"),
  });
  const report = renderStudentSimulationReport({ scenario, result, outputDir });
  await writeFile(join(outputDir, "simulation-report.md"), report, "utf8");
  io.stdout(report);
  return result.status === "passed" ? 0 : 1;
}

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function defaultIo(): BrowserCliIo {
  return {
    cwd: process.cwd(),
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  };
}

function usage(): string {
  return `Usage:
  pnpm student-sim:browser:list
  PRAXIS_RUN_BROWSER_SIMULATION=1 tsx scripts/student-sim-browser.ts run <scenario-id> --app-url <url> [--out <dir>] [--headed]

The Playwright spec remains the self-contained browser runner:
  pnpm student-sim:browser
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = await runStudentSimulationBrowserCli(process.argv.slice(2));
  process.exitCode = code;
}
