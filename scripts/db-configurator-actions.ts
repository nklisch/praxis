/**
 * db:configurator-actions — CLI script to display the configurator audit log.
 *
 * Usage: pnpm db:configurator-actions [--limit N] [--from <timestamp-ms>]
 *
 * Reads `configurator_actions` rows (most recent first) and prints a formatted
 * table with action kind, configurator ID, timestamp, and key action fields.
 *
 * Exit 0 when rows exist or empty; exit 1 on DB error.
 */

import { openDb } from "@praxis/core/db";
import { configuratorActions } from "@praxis/core/schema";
import { desc, gte } from "drizzle-orm";

// ── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let limit = 50;
let fromTs: number | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--limit" && args[i + 1]) {
    limit = parseInt(args[i + 1]!, 10);
    i++;
  } else if (args[i] === "--from" && args[i + 1]) {
    fromTs = parseInt(args[i + 1]!, 10);
    i++;
  }
}

// ── DB query ─────────────────────────────────────────────────────────────────

const { db } = openDb({ readonly: true });

const whereClause = fromTs !== undefined ? gte(configuratorActions.ts, new Date(fromTs)) : undefined;

const rows = db
  .select()
  .from(configuratorActions)
  .where(whereClause)
  .orderBy(desc(configuratorActions.ts))
  .limit(limit)
  .all();

// ── Display ──────────────────────────────────────────────────────────────────

if (rows.length === 0) {
  console.log("\nNo configurator actions found. Run a configure session and make some edits.\n");
  process.exit(0);
}

type ActionJson = {
  kind: string;
  courseId?: string;
  lessonId?: string;
  gateId?: string;
  conceptId?: string;
  misconceptionId?: string;
  modeId?: string;
  fragmentId?: string;
  reason?: string;
  [key: string]: unknown;
};

const tableRows = rows.map((row) => {
  const action = row.actionJson as ActionJson;
  const ts = row.ts.toISOString().slice(0, 19).replace("T", " ");

  // Summarize key action fields into a compact string for display.
  const details: string[] = [];
  if (action.courseId) details.push(`course=${action.courseId.slice(0, 8)}…`);
  if (action.lessonId) details.push(`lesson=${action.lessonId.slice(0, 8)}…`);
  if (action.gateId) details.push(`gate=${action.gateId.slice(0, 8)}…`);
  if (action.conceptId) details.push(`concept=${action.conceptId.slice(0, 8)}…`);
  if (action.misconceptionId) details.push(`misconception=${action.misconceptionId.slice(0, 8)}…`);
  if (action.modeId) details.push(`mode=${action.modeId}`);
  if (action.fragmentId) details.push(`fragment=${action.fragmentId}`);
  if (action.reason) details.push(`reason="${action.reason.slice(0, 30)}${action.reason.length > 30 ? "…" : ""}"`);

  return {
    ts,
    kind: action.kind,
    configuratorId: row.configuratorId.slice(0, 12),
    details: details.join(", ") || "(no details)",
  };
});

console.log(
  `\nConfigurator actions (${rows.length} rows, newest first, limit=${limit})\n`,
);
console.table(tableRows);
