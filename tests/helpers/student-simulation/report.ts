import { join } from "node:path";
import type { StudentSimulationResult, StudentSimulationScenario } from "@praxis/core/types";

export interface StudentSimulationReportInput {
  scenario: StudentSimulationScenario;
  result: StudentSimulationResult;
  outputDir: string;
  nextDebugStep?: string;
}

export function renderStudentSimulationReport(input: StudentSimulationReportInput): string {
  const firstBadObservation = getFirstBadObservation(input.result);
  const nextDebugStep = input.nextDebugStep ?? defaultNextDebugStep(input.result);
  const artifactLines =
    input.result.artifacts.length === 0
      ? ["- none"]
      : input.result.artifacts.map(
          (artifact) =>
            `- ${artifact.kind}: ${artifact.path} (${artifact.source}${
              artifact.description === undefined ? "" : `; ${artifact.description}`
            })`,
        );
  const failureBundle =
    input.result.status === "failed"
      ? buildDebugBundleCommand({
          result: input.result,
          outputDir: input.outputDir,
          firstBadObservation,
          nextDebugStep,
        })
      : "not needed; simulation passed";

  return [
    "# Student Simulation Report",
    "",
    `- Scenario: ${input.scenario.id} - ${input.scenario.title}`,
    `- Persona: ${input.scenario.persona.label} (${input.scenario.persona.id})`,
    `- Driver: ${input.result.driver}`,
    `- Determinism: ${input.result.determinism}`,
    `- Status: ${input.result.status}`,
    `- Run id: ${input.result.runId}`,
    `- Sessions: ${formatList(input.result.sessionIds)}`,
    `- Tool calls: ${formatList(input.result.callIds)}`,
    `- Renderer events: ${formatList(input.result.rendererEventIds)}`,
    "",
    "## First Bad Observation",
    "",
    firstBadObservation,
    "",
    "## Artifacts",
    "",
    ...artifactLines,
    "",
    "## Next Debug Step",
    "",
    nextDebugStep,
    "",
    "## Failure Bundle",
    "",
    failureBundle,
    "",
  ].join("\n");
}

export function getFirstBadObservation(result: StudentSimulationResult): string {
  const failedStep = result.steps.find((step) => step.status === "failed");
  if (failedStep === undefined) return "none";
  return failedStep.observation ?? failedStep.error ?? `step ${failedStep.index} failed`;
}

export function buildDebugBundleCommand(input: {
  result: StudentSimulationResult;
  outputDir: string;
  firstBadObservation: string;
  nextDebugStep: string;
}): string {
  const args = [
    "pnpm",
    "debug:bundle",
    "--out",
    join(input.outputDir, "debug-bundle"),
    "--failure-class",
    "simulation",
    "--title",
    `Student simulation ${input.result.scenarioId}`,
    "--run",
    input.result.runId,
    "--first-bad",
    input.firstBadObservation,
    "--next-step",
    input.nextDebugStep,
  ];
  const sessionId = input.result.sessionIds[0];
  if (sessionId !== undefined) args.push("--session", sessionId);
  const callId = input.result.callIds[0];
  if (callId !== undefined) args.push("--call", callId);
  return args.map(shellQuote).join(" ");
}

function defaultNextDebugStep(result: StudentSimulationResult): string {
  if (result.status !== "failed") return "No action needed.";
  if (result.driver === "browser") {
    return "Open the Playwright trace and inspect the final DOM/screenshot for the first visual anomaly.";
  }
  return "Open the simulation events and steps JSONL files, then bundle the correlated run ids.";
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
