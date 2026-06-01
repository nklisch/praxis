#!/usr/bin/env tsx
import { loadDebugBundle } from "../packages/core/src/services/debug/debug-bundle-loader.js";
import { generateDebugBundleReport } from "../packages/core/src/services/debug/debug-bundle-report.js";
import { replayDebugBundle } from "../tests/helpers/replay-runner.js";

const args = process.argv.slice(2);

async function main(): Promise<void> {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }
  const bundleDir = valueAfter("--bundle");
  const dbPath = valueAfter("--db");
  if (bundleDir === undefined) throw new Error("Missing --bundle");
  if (dbPath === undefined)
    throw new Error("Missing --db. Replay must use an explicit temp DB path.");

  const loaded = await loadDebugBundle({ bundleDir });
  const replay = await replayDebugBundle({ bundleDir, dbPath });

  console.log(generateDebugBundleReport({ manifest: loaded.manifest }));
  console.log("## Replay");
  console.log(`- Replayed turn: ${replay.replayedTurn.turnIndex}`);
  console.log(`- Yielded events: ${replay.yieldedEvents.map((event) => event.type).join(", ")}`);
  console.log(`- Trace records: ${replay.traceRecords.length}`);
  console.log(`- Episodic rows after replay: ${replay.episodicRows.length}`);
  console.log("- Limitations:");
  for (const limitation of replay.limitations) {
    console.log(`  - ${limitation}`);
  }
}

function valueAfter(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function printUsage(): void {
  console.log(`Usage:
  pnpm debug:replay --bundle <bundle-dir> --db <temp-db-path>

Replay always requires an explicit --db path so it does not mutate .praxis/dev.db.
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
