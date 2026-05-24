/**
 * Unit tests for the dev-reports writer.
 *
 * Each test suite uses a fresh temp dir so tests are fully isolated.
 * Tests cover:
 *  - Directory creation on first write
 *  - Filename format (<ISO-no-colons>-<slug>.md)
 *  - File body: frontmatter + Details section
 *  - Optional frontmatter fields (severity, tool_ref, fragment_ref)
 *  - INDEX.md regeneration and format
 *  - Truncation at 100 entries with archive overflow
 *  - Concurrent writes serialised (no INDEX corruption)
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DevReport } from "@praxis/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { buildFilename, createDevReportsWriter, renderReport } from "../dev-reports-writer.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<DevReport> = {}): DevReport {
  return {
    kind: "confusing-tool",
    summary: "Confusing ask_student_question description",
    severity: "med",
    toolRef: "ask_student_question",
    sessionId: "session-abc",
    modeId: "teach",
    timestamp: "2026-05-24T14:32:19.000Z",
    ...overrides,
  };
}

// ── buildFilename ─────────────────────────────────────────────────────────────

describe("buildFilename", () => {
  it("replaces colons in timestamp and slugifies first 5 words", () => {
    // ask_student_question has underscores stripped → 3 words; with "Confusing" and "description"
    // the full set is: confusing, ask, student, question, description (5 words from 5 after splitting)
    const result = buildFilename(
      "2026-05-24T14:32:19.000Z",
      "Confusing ask_student_question description here extra",
    );
    expect(result).toBe("2026-05-24T14-32-19.000Z-confusing-ask-student-question-description.md");
  });

  it("slugifies exactly 5 words from summary", () => {
    const result = buildFilename("2026-05-24T14:32:19Z", "one two three four five six seven");
    expect(result).toBe("2026-05-24T14-32-19Z-one-two-three-four-five.md");
  });

  it("handles summary with fewer than 5 words", () => {
    const result = buildFilename("2026-05-24T14:32:19Z", "short summary");
    expect(result).toBe("2026-05-24T14-32-19Z-short-summary.md");
  });

  it("strips punctuation from summary when slugifying", () => {
    const result = buildFilename("2026-01-01T00:00:00Z", "tool_ref: broken! (see docs)");
    expect(result).toBe("2026-01-01T00-00-00Z-tool-ref-broken-see-docs.md");
  });
});

// ── renderReport ──────────────────────────────────────────────────────────────

describe("renderReport", () => {
  it("renders frontmatter with all optional fields present", () => {
    const report = makeReport();
    const rendered = renderReport(report);

    expect(rendered).toContain("---\n");
    expect(rendered).toContain("kind: confusing-tool\n");
    expect(rendered).toContain("summary: Confusing ask_student_question description\n");
    expect(rendered).toContain("severity: med\n");
    expect(rendered).toContain("tool_ref: ask_student_question\n");
    expect(rendered).toContain("session_id: session-abc\n");
    expect(rendered).toContain("mode_id: teach\n");
    expect(rendered).toContain("timestamp: 2026-05-24T14:32:19.000Z\n");
  });

  it("omits optional fields when absent", () => {
    const report = makeReport({ severity: undefined, toolRef: undefined, fragmentRef: undefined });
    const rendered = renderReport(report);

    expect(rendered).not.toContain("severity:");
    expect(rendered).not.toContain("tool_ref:");
    expect(rendered).not.toContain("fragment_ref:");
  });

  it("includes fragment_ref when present", () => {
    const report = makeReport({ fragmentRef: "dev.agent-feedback", toolRef: undefined });
    const rendered = renderReport(report);
    expect(rendered).toContain("fragment_ref: dev.agent-feedback\n");
  });

  it("renders # heading from summary and ## Details section", () => {
    const report = makeReport({ details: "The description is confusing." });
    const rendered = renderReport(report);
    expect(rendered).toContain("# Confusing ask_student_question description\n");
    expect(rendered).toContain("## Details\nThe description is confusing.");
  });

  it("renders ## Details section with empty body when details is absent", () => {
    const report = makeReport({ details: undefined });
    const rendered = renderReport(report);
    expect(rendered).toContain("## Details\n");
  });

  it("quotes summary that contains a colon", () => {
    const report = makeReport({ summary: "tool: broken result" });
    const rendered = renderReport(report);
    // Should be quoted because of colon
    expect(rendered).toContain('summary: "tool: broken result"');
  });
});

// ── createDevReportsWriter — filesystem tests ─────────────────────────────────

describe("createDevReportsWriter", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "praxis-dev-"));
  });

  // No afterEach cleanup — OS will clean up temp dirs; keeping them aids
  // debugging if a test fails.

  it("creates the root directory if it does not exist", async () => {
    const rootDir = join(tmpDir, "nested", "dev-reports");
    const writer = createDevReportsWriter({ rootDir });
    await writer.writeReport(makeReport());
    // If writeReport didn't throw, the directory was created.
    const { stat } = await import("node:fs/promises");
    const s = await stat(rootDir);
    expect(s.isDirectory()).toBe(true);
  });

  it("writes a file with the correct filename format", async () => {
    const writer = createDevReportsWriter({ rootDir: tmpDir });
    const report = makeReport({ timestamp: "2026-05-24T14:32:19.000Z" });
    const { filePath } = await writer.writeReport(report);
    // "Confusing ask_student_question description" → underscore splits to 5 words:
    // confusing, ask, student, question, description
    expect(filePath).toMatch(
      /2026-05-24T14-32-19\.000Z-confusing-ask-student-question-description\.md$/,
    );
  });

  it("file body contains frontmatter and Details section", async () => {
    const writer = createDevReportsWriter({ rootDir: tmpDir });
    const report = makeReport({ details: "The tool description is unclear." });
    const { filePath } = await writer.writeReport(report);
    const content = await readFile(filePath, "utf8");
    expect(content).toContain("kind: confusing-tool");
    expect(content).toContain("tool_ref: ask_student_question");
    expect(content).toContain("## Details\nThe tool description is unclear.");
  });

  it("multiple reports produce unique files", async () => {
    const writer = createDevReportsWriter({ rootDir: tmpDir });
    const r1 = makeReport({ timestamp: "2026-05-24T14:32:19.000Z", summary: "First issue here" });
    const r2 = makeReport({ timestamp: "2026-05-24T14:32:20.000Z", summary: "Second issue here" });
    const { filePath: fp1 } = await writer.writeReport(r1);
    const { filePath: fp2 } = await writer.writeReport(r2);
    expect(fp1).not.toBe(fp2);
    const c1 = await readFile(fp1, "utf8");
    const c2 = await readFile(fp2, "utf8");
    expect(c1).toContain("First issue here");
    expect(c2).toContain("Second issue here");
  });

  it("creates INDEX.md after first write", async () => {
    const writer = createDevReportsWriter({ rootDir: tmpDir });
    await writer.writeReport(makeReport());
    const index = await readFile(join(tmpDir, "INDEX.md"), "utf8");
    expect(index).toContain("# Dev Reports");
    expect(index).toContain("Confusing ask_student_question description");
  });

  it("INDEX.md lists entries in reverse-chronological order", async () => {
    const writer = createDevReportsWriter({ rootDir: tmpDir });
    await writer.writeReport(
      makeReport({ timestamp: "2026-01-01T00:00:01Z", summary: "Older issue here today" }),
    );
    await writer.writeReport(
      makeReport({ timestamp: "2026-01-01T00:00:02Z", summary: "Newer issue here today" }),
    );
    const index = await readFile(join(tmpDir, "INDEX.md"), "utf8");
    const olderPos = index.indexOf("Older issue");
    const newerPos = index.indexOf("Newer issue");
    // Newer should appear first (lower line index = higher position for reverse-chron).
    expect(newerPos).toBeLessThan(olderPos);
  });

  it("INDEX.md links point to the correct filename", async () => {
    const writer = createDevReportsWriter({ rootDir: tmpDir });
    const report = makeReport({ timestamp: "2026-05-24T14:32:19.000Z" });
    await writer.writeReport(report);
    const index = await readFile(join(tmpDir, "INDEX.md"), "utf8");
    // "Confusing ask_student_question description" slugifies to 5 words (underscore is treated as separator)
    expect(index).toContain(
      "(2026-05-24T14-32-19.000Z-confusing-ask-student-question-description.md)",
    );
  });

  it("truncates INDEX.md at 100 entries and writes overflow to INDEX.archive.md", async () => {
    const writer = createDevReportsWriter({ rootDir: tmpDir });

    // Write 101 reports with distinct timestamps and summaries.
    for (let i = 1; i <= 101; i++) {
      const ts = `2026-05-24T00:00:${String(i).padStart(2, "0")}Z`;
      await writer.writeReport(
        makeReport({
          timestamp: ts,
          summary: `Issue number ${String(i).padStart(3, "0")} here today`,
        }),
      );
    }

    const index = await readFile(join(tmpDir, "INDEX.md"), "utf8");
    const indexLines = index.split("\n").filter((l) => l.startsWith("- ["));
    expect(indexLines).toHaveLength(100);

    // The oldest entry (#1) should have spilled to archive.
    const archive = await readFile(join(tmpDir, "INDEX.archive.md"), "utf8");
    expect(archive).toContain("Issue number 001 here today");
    // The newest entry (#101) should remain in INDEX.md.
    expect(index).toContain("Issue number 101 here today");
  });

  it("INDEX.archive.md gets archive header on first creation", async () => {
    const writer = createDevReportsWriter({ rootDir: tmpDir });
    for (let i = 1; i <= 101; i++) {
      const ts = `2026-05-24T00:00:${String(i).padStart(2, "0")}Z`;
      await writer.writeReport(
        makeReport({ timestamp: ts, summary: `Archive header test issue ${i}` }),
      );
    }
    const archive = await readFile(join(tmpDir, "INDEX.archive.md"), "utf8");
    expect(archive).toMatch(/^# Dev Reports Archive/);
  });

  it("handles concurrent writes without corrupting INDEX.md", async () => {
    const writer = createDevReportsWriter({ rootDir: tmpDir });
    const N = 20;
    const reports = Array.from({ length: N }, (_, i) => {
      const ts = `2026-05-24T00:00:${String(i + 1).padStart(2, "0")}Z`;
      return makeReport({ timestamp: ts, summary: `Concurrent issue ${i + 1} here today` });
    });

    // Fire all writes in parallel.
    await Promise.all(reports.map((r) => writer.writeReport(r)));

    const index = await readFile(join(tmpDir, "INDEX.md"), "utf8");
    const indexLines = index.split("\n").filter((l) => l.startsWith("- ["));
    // All 20 entries should be present; no duplicates.
    expect(indexLines).toHaveLength(N);
    const uniqueLines = new Set(indexLines);
    expect(uniqueLines.size).toBe(N);
  });

  it("handles a report with details containing markdown formatting", async () => {
    const details = "## Sub-heading\n\n- bullet 1\n- bullet 2\n\n```ts\nconst x = 1;\n```";
    const writer = createDevReportsWriter({ rootDir: tmpDir });
    const { filePath } = await writer.writeReport(makeReport({ details }));
    const content = await readFile(filePath, "utf8");
    expect(content).toContain("## Details\n## Sub-heading");
    expect(content).toContain("```ts");
  });
});
