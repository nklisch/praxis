/**
 * Dev-reports writer — persists `dev.report_issue` tool calls to
 * `.praxis/dev-reports/` as Markdown files.
 *
 * The `DevReport` and `DevReportsWriter` interfaces are the canonical declarations
 * that live in `@praxis/core/types` (to avoid cyclic deps). This module owns the
 * concrete implementation: `createDevReportsWriter`.
 *
 * Design notes:
 * - This module is only ever instantiated when `PRAXIS_DEV === "true"`.
 *   `process.cwd()` is assumed to be the repo root (standard for dev runs).
 *   If you somehow invoke this in a packaged Electron build, the gate in
 *   services.ts should have prevented it — trust the gate, no path heuristics.
 * - INDEX.md writes are serialised via a promise-chain mutex so concurrent
 *   `writeReport` calls never produce a torn INDEX. The per-report file writes
 *   go through in parallel (different filenames, no contention).
 * - INDEX.archive.md receives overflow entries beyond 100 (prepend, reverse-chron).
 *   It grows unbounded; devs can `rm .praxis/dev-reports/INDEX.archive.md` periodically.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DevReport, DevReportsWriter } from "@praxis/core/types";

// Re-export the shared types from @praxis/core/types so callers can import
// them from either location without pulling in all of @praxis/core.
export type { DevReport, DevReportsWriter };

// ── Factory ───────────────────────────────────────────────────────────────────

export interface DevReportsWriterOptions {
  /**
   * Root of the `.praxis/dev-reports/` directory. Defaults to
   * `process.cwd() + "/.praxis/dev-reports"`.
   */
  rootDir?: string;
}

/**
 * Create a `DevReportsWriter` that writes report files to `rootDir` and
 * maintains a serialised `INDEX.md` (+ `INDEX.archive.md` for overflow).
 */
export function createDevReportsWriter(opts?: DevReportsWriterOptions): DevReportsWriter {
  const dir = opts?.rootDir ?? join(process.cwd(), ".praxis", "dev-reports");

  // Promise-chain mutex: each INDEX write task is appended so they serialize.
  let indexLock: Promise<void> = Promise.resolve();

  function serializeIndexWrite(task: () => Promise<void>): Promise<void> {
    // Continue after error so a single failed write doesn't deadlock the chain.
    indexLock = indexLock.then(task, task);
    return indexLock;
  }

  return {
    async writeReport(report: DevReport): Promise<{ filePath: string }> {
      // Ensure the directory exists before writing anything.
      await mkdir(dir, { recursive: true });

      const filename = buildFilename(report.timestamp, report.summary);
      const filePath = join(dir, filename);
      const body = renderReport(report);

      // Write the report file — can proceed in parallel with other reports
      // since each file has a unique name.
      await writeFile(filePath, body, "utf8");

      // Serialize the INDEX regeneration so concurrent calls don't race.
      await serializeIndexWrite(() => regenerateIndex(dir, filename, report));

      return { filePath };
    },
  };
}

// ── Filename & rendering helpers ──────────────────────────────────────────────

const MAX_INDEX_ENTRIES = 100;

/**
 * Build the filename for a report.
 * Format: `<ISO-no-colons>-<slug>.md`
 * Example: `2026-05-24T14-32-19-confusing-ask-student-question.md`
 *
 * Slug = first 5 words of `summary`, lowercase, kebab-case.
 */
export function buildFilename(isoTimestamp: string, summary: string): string {
  const ts = isoTimestamp.replace(/:/g, "-");
  const slug = summary
    .toLowerCase()
    // Replace any non-alphanumeric (including underscores) with a space so
    // word-splitting works naturally across snake_case identifiers.
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("-");
  return `${ts}-${slug}.md`;
}

/**
 * Render a `DevReport` as a Markdown file with YAML frontmatter.
 *
 * Frontmatter fields that are undefined are omitted so the file stays clean.
 */
export function renderReport(report: DevReport): string {
  const frontmatterLines: string[] = [
    `kind: ${report.kind}`,
    `summary: ${yamlScalar(report.summary)}`,
  ];
  if (report.severity !== undefined) {
    frontmatterLines.push(`severity: ${report.severity}`);
  }
  if (report.toolRef !== undefined) {
    frontmatterLines.push(`tool_ref: ${yamlScalar(report.toolRef)}`);
  }
  if (report.fragmentRef !== undefined) {
    frontmatterLines.push(`fragment_ref: ${yamlScalar(report.fragmentRef)}`);
  }
  frontmatterLines.push(
    `session_id: ${report.sessionId}`,
    `mode_id: ${report.modeId}`,
    `timestamp: ${report.timestamp}`,
  );

  const frontmatter = `---\n${frontmatterLines.join("\n")}\n---`;

  const body = `${`# ${report.summary}\n\n## Details\n${report.details ?? ""}`.trimEnd()}\n`;

  return `${frontmatter}\n\n${body}`;
}

/**
 * Minimal YAML scalar quoting: wrap in double-quotes if the value contains
 * characters that could confuse a YAML parser (`:`, `#`, leading/trailing
 * whitespace). Simple heuristic — sufficient for dev-report summaries.
 */
function yamlScalar(value: string): string {
  if (/[:#\n\r"]/.test(value) || value !== value.trim()) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

// ── INDEX maintenance ─────────────────────────────────────────────────────────

interface IndexEntry {
  filename: string;
  summary: string;
  timestamp: string;
}

/** Parse existing INDEX.md into an ordered list of entries (newest first). */
async function readIndex(indexPath: string): Promise<IndexEntry[]> {
  let content: string;
  try {
    content = await readFile(indexPath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const entries: IndexEntry[] = [];
  // Each entry is a line of the form: `- [summary](filename) — timestamp`
  const lineRe = /^- \[([^\]]+)\]\(([^)]+\.md)\) — (.+)$/;
  for (const line of content.split("\n")) {
    const m = lineRe.exec(line);
    if (m) {
      const summary = m[1] ?? "";
      const filename = m[2] ?? "";
      const timestamp = m[3] ?? "";
      entries.push({ summary, filename, timestamp });
    }
  }
  return entries;
}

/**
 * Regenerate INDEX.md (reverse-chronological) after a new report is written.
 * Entries beyond MAX_INDEX_ENTRIES are prepended to INDEX.archive.md.
 */
async function regenerateIndex(dir: string, newFilename: string, report: DevReport): Promise<void> {
  const indexPath = join(dir, "INDEX.md");
  const archivePath = join(dir, "INDEX.archive.md");

  // Read current index state.
  const existing = await readIndex(indexPath);

  // Prepend the new entry (newest first).
  const newEntry: IndexEntry = {
    filename: newFilename,
    summary: report.summary,
    timestamp: report.timestamp,
  };

  // Deduplicate: in case of a retry/re-write with the same filename, replace.
  const all: IndexEntry[] = [newEntry, ...existing.filter((e) => e.filename !== newFilename)];

  // Split at MAX_INDEX_ENTRIES.
  const live = all.slice(0, MAX_INDEX_ENTRIES);
  const overflow = all.slice(MAX_INDEX_ENTRIES);

  // Move overflow entries to INDEX.archive.md (prepend, newest first).
  if (overflow.length > 0) {
    let archiveContent = "";
    try {
      archiveContent = await readFile(archivePath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    // Build the archive section header only if the file was empty / new.
    const archiveHeader = archiveContent.trim() === "" ? "# Dev Reports Archive\n\n" : "";
    const newArchiveLines = overflow.map(formatIndexLine).join("\n");
    await writeFile(archivePath, `${archiveHeader}${newArchiveLines}\n${archiveContent}`, "utf8");
  }

  // Write fresh INDEX.md.
  const indexLines = live.map(formatIndexLine).join("\n");
  const header = "# Dev Reports\n\n";
  await writeFile(indexPath, `${header}${indexLines}\n`, "utf8");
}

function formatIndexLine(entry: IndexEntry): string {
  return `- [${entry.summary}](${entry.filename}) — ${entry.timestamp}`;
}
