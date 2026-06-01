#!/usr/bin/env tsx
import { openDb } from "@praxis/core/db";
import type { DebugBundleCaptureInput, DebugFailureClass, SessionId } from "@praxis/core/types";
import { DebugBundleCaptureServiceImpl } from "../packages/core/src/services/debug/debug-bundle-capture-service.js";
import { generateDebugBundleReport } from "../packages/core/src/services/debug/debug-bundle-report.js";

const args = process.argv.slice(2);

async function main(): Promise<void> {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }

  const dbPath = valueAfter("--db");
  const { db, sqlite } = openDb(dbPath === undefined ? {} : { path: dbPath });
  try {
    const input = parseCaptureInput();
    const result = await new DebugBundleCaptureServiceImpl({ db }).capture(input);
    console.log(`Bundle: ${result.bundleDir}`);
    console.log(generateDebugBundleReport({ manifest: result.manifest }));
  } finally {
    if (dbPath !== undefined) sqlite.close();
  }
}

function parseCaptureInput(): DebugBundleCaptureInput {
  const failureClass = valueAfter("--failure-class");
  const title = valueAfter("--title");
  if (failureClass === undefined || !isFailureClass(failureClass)) {
    throw new Error("Missing or invalid --failure-class");
  }
  if (title === undefined || title.length === 0) {
    throw new Error("Missing --title");
  }
  const sessionId = valueAfter("--session");
  const outputRoot = valueAfter("--out");
  return {
    failureClass,
    title,
    ...(valueAfter("--run") !== undefined && { runId: valueAfter("--run") }),
    ...(sessionId !== undefined && { sessionId: sessionId as SessionId }),
    ...(valueAfter("--turn") !== undefined && { turnId: valueAfter("--turn") }),
    ...(valueAfter("--call") !== undefined && { callId: valueAfter("--call") }),
    ...(valueAfter("--first-bad") !== undefined && {
      firstBadObservation: valueAfter("--first-bad"),
    }),
    ...(valueAfter("--next-step") !== undefined && { nextDebugStep: valueAfter("--next-step") }),
    ...(outputRoot !== undefined && { outputRoot }),
    ...(valueAfter("--log") !== undefined && { logFilePath: valueAfter("--log") }),
  };
}

function valueAfter(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function isFailureClass(value: string): value is DebugFailureClass {
  return [
    "agent-behavior",
    "tool-dispatch",
    "subagent",
    "ipc",
    "ui-render",
    "persistence",
    "simulation",
  ].includes(value);
}

function printUsage(): void {
  console.log(`Usage:
  pnpm debug:bundle --db <path> --out <dir> --session <id> --failure-class <class> --title <title>

Options:
  --run <id>          Capture by run id when live trace records are available.
  --turn <id>         Capture by turn id.
  --call <id>         Capture by call id.
  --session <id>      Capture by Praxis session id.
  --log <path>        Optional pino JSONL log file.
  --first-bad <text>  First bad observation for the report.
  --next-step <text>  Suggested next debug step.
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
