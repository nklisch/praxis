#!/usr/bin/env tsx
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DebugTraceRegistryImpl } from "@praxis/core/services";
import type { StudentSimulationDriverKind, StudentSimulationScenario } from "@praxis/core/types";
import { createStudentSimulationClientRunner } from "../tests/helpers/student-simulation/client-runner.js";
import { createInProcessSimulationClient } from "../tests/helpers/student-simulation/in-process-client.js";
import { renderStudentSimulationReport } from "../tests/helpers/student-simulation/report.js";
import {
  getStudentSimulationFixture,
  STUDENT_SIMULATION_SCENARIOS,
} from "../tests/helpers/student-simulation/scenarios/index.js";

export interface StudentSimulationCliIo {
  cwd: string;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  now?: () => Date;
}

type StudentSimulationCliEnv = Readonly<Record<string, string | undefined>>;

interface RunOptions {
  scenarioId: string;
  driver: StudentSimulationDriverKind;
  outputDir: string;
  runId?: string;
}

const DEFAULT_DRIVER: StudentSimulationDriverKind = "client";

export async function runStudentSimulationCli(
  args: readonly string[],
  env: StudentSimulationCliEnv = process.env,
  io: StudentSimulationCliIo = defaultIo(),
): Promise<number> {
  try {
    const command = args[0] ?? "help";
    if (command === "help" || command === "--help" || command === "-h") {
      io.stdout(usage());
      return 0;
    }
    if (command === "list") {
      printScenarioList(args.slice(1), io);
      return 0;
    }
    if (command === "run") {
      return await runScenario(parseRunOptions(args.slice(1), io), env, io);
    }
    throw new Error(`Unknown student simulation command: ${command}`);
  } catch (err) {
    io.stderr(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export function assertLiveSimulationAllowed(
  scenario: StudentSimulationScenario,
  env: StudentSimulationCliEnv = process.env,
): void {
  if (scenario.determinism !== "live") return;
  if (env.PRAXIS_RUN_LIVE_SIMULATION === "1") return;
  throw new Error(
    `Scenario ${scenario.id} is live/model-backed. Set PRAXIS_RUN_LIVE_SIMULATION=1 to run it.`,
  );
}

async function runScenario(
  options: RunOptions,
  env: StudentSimulationCliEnv,
  io: StudentSimulationCliIo,
): Promise<number> {
  const fixture = getStudentSimulationFixture(options.scenarioId);
  const scenario = fixture.scenario;
  if (!scenario.drivers.includes(options.driver)) {
    throw new Error(`Scenario ${scenario.id} does not support driver ${options.driver}`);
  }
  assertLiveSimulationAllowed(scenario, env);
  if (options.driver !== "client") {
    throw new Error("Use pnpm student-sim:browser for browser-backed simulation runs.");
  }

  await mkdir(options.outputDir, { recursive: true });
  const debugTrace = new DebugTraceRegistryImpl({ maxRecords: 10_000 });
  const client = await createInProcessSimulationClient({
    dbPath: join(options.outputDir, "simulation.db"),
    engineTurns: fixture.engineTurns,
    quickChecks: fixture.quickChecks,
    debugTrace,
  });
  const result = await createStudentSimulationClientRunner().run({
    scenario,
    client,
    outputDir: options.outputDir,
    ...(options.runId !== undefined && { runId: options.runId }),
    debugTrace,
    now: io.now,
  });
  const report = renderStudentSimulationReport({
    scenario,
    result,
    outputDir: options.outputDir,
  });
  await writeFile(join(options.outputDir, "simulation-report.md"), report, "utf8");
  io.stdout(report);
  return result.status === "passed" ? 0 : 1;
}

function printScenarioList(args: readonly string[], io: StudentSimulationCliIo): void {
  const driver = parseDriver(valueAfter(args, "--driver") ?? "");
  const scenarios = STUDENT_SIMULATION_SCENARIOS.filter((scenario) =>
    driver === undefined ? true : scenario.drivers.includes(driver),
  );
  for (const scenario of scenarios) {
    io.stdout(
      `${scenario.id}\t${scenario.determinism}\t${scenario.drivers.join(",")}\t${scenario.title}`,
    );
  }
}

function parseRunOptions(args: readonly string[], io: StudentSimulationCliIo): RunOptions {
  const scenarioId = args.find((arg) => !arg.startsWith("--"));
  if (scenarioId === undefined) throw new Error("Missing scenario id.");
  const driver = parseDriver(valueAfter(args, "--driver") ?? "") ?? DEFAULT_DRIVER;
  const outputDir =
    valueAfter(args, "--out") ??
    join(
      io.cwd,
      ".praxis",
      "debug",
      "simulations",
      `${Date.now()}-${scenarioId.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`,
    );
  return {
    scenarioId,
    driver,
    outputDir: resolve(io.cwd, outputDir),
    ...(valueAfter(args, "--run") !== undefined && { runId: valueAfter(args, "--run") }),
  };
}

function parseDriver(value: string): StudentSimulationDriverKind | undefined {
  if (value === "") return undefined;
  if (value === "client" || value === "browser") return value;
  throw new Error(`Invalid --driver: ${value}`);
}

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function defaultIo(): StudentSimulationCliIo {
  return {
    cwd: process.cwd(),
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  };
}

function usage(): string {
  return `Usage:
  pnpm student-sim list [--driver client|browser]
  pnpm student-sim run <scenario-id> [--driver client] [--out <dir>] [--run <id>]

Live/model-backed scenarios require PRAXIS_RUN_LIVE_SIMULATION=1.
Browser visual runs use pnpm student-sim:browser.
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = await runStudentSimulationCli(process.argv.slice(2));
  process.exitCode = code;
}
