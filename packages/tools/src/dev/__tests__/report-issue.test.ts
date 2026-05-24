/**
 * Unit tests for the `dev.report_issue` tool.
 *
 * Tests:
 *  - Zod input schema validation (happy path + rejections)
 *  - Zod output schema
 *  - Handler happy path (writer present)
 *  - Handler returns DEV_REPORTS_UNAVAILABLE error when writer missing
 *  - Tool metadata (name, tier, effects)
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { createDevReportsWriter } from "../dev-reports-writer.js";
import { ReportIssueInput, ReportIssueOutput, reportIssueTool } from "../report-issue.js";

// ── Schema validation ─────────────────────────────────────────────────────────

const minValidInput = {
  kind: "confusing-tool" as const,
  summary: "The tool description is unclear.",
};

describe("ReportIssueInput schema", () => {
  it("accepts minimal valid input (kind + summary only)", () => {
    expect(ReportIssueInput.safeParse(minValidInput).success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const input = {
      ...minValidInput,
      severity: "high",
      tool_ref: "ask_student_question",
      fragment_ref: "dev.agent-feedback",
      details: "Long-form explanation here.",
    };
    expect(ReportIssueInput.safeParse(input).success).toBe(true);
  });

  it("accepts all valid kind values", () => {
    const kinds = [
      "confusing-tool",
      "contradictory-prompt",
      "missing-tool",
      "broken-result",
      "cant-execute",
      "other",
    ] as const;
    for (const kind of kinds) {
      expect(ReportIssueInput.safeParse({ kind, summary: "test" }).success).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    const result = ReportIssueInput.safeParse({ kind: "unknown-kind", summary: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects empty summary (min 1 char)", () => {
    const result = ReportIssueInput.safeParse({ kind: "other", summary: "" });
    expect(result.success).toBe(false);
  });

  it("rejects summary longer than 200 chars", () => {
    const result = ReportIssueInput.safeParse({
      kind: "other",
      summary: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("accepts summary of exactly 200 chars", () => {
    const result = ReportIssueInput.safeParse({
      kind: "other",
      summary: "x".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid severity value", () => {
    const result = ReportIssueInput.safeParse({
      kind: "other",
      summary: "test",
      severity: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("accepts severity low/med/high", () => {
    for (const severity of ["low", "med", "high"]) {
      expect(ReportIssueInput.safeParse({ kind: "other", summary: "test", severity }).success).toBe(
        true,
      );
    }
  });

  it("rejects missing kind", () => {
    const result = ReportIssueInput.safeParse({ summary: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects missing summary", () => {
    const result = ReportIssueInput.safeParse({ kind: "other" });
    expect(result.success).toBe(false);
  });
});

describe("ReportIssueOutput schema", () => {
  it("accepts { ok: true, file: string }", () => {
    expect(ReportIssueOutput.safeParse({ ok: true, file: "/some/path.md" }).success).toBe(true);
  });

  it("rejects ok: false", () => {
    expect(ReportIssueOutput.safeParse({ ok: false, file: "/some/path.md" }).success).toBe(false);
  });

  it("rejects missing file field", () => {
    expect(ReportIssueOutput.safeParse({ ok: true }).success).toBe(false);
  });
});

// ── Tool metadata ─────────────────────────────────────────────────────────────

describe("reportIssueTool metadata", () => {
  it('has name "dev.report_issue"', () => {
    expect(reportIssueTool.name).toBe("dev.report_issue");
  });

  it('has tier "deterministic"', () => {
    expect(reportIssueTool.tier).toBe("deterministic");
  });

  it('has effects ["filesystem"]', () => {
    expect(reportIssueTool.effects).toContain("filesystem");
    expect(reportIssueTool.effects).toHaveLength(1);
  });
});

// ── Handler ───────────────────────────────────────────────────────────────────

describe("reportIssueTool handler", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "praxis-dev-tool-"));
  });

  it("writes report and returns { ok: true, file } on happy path", async () => {
    const devReportsWriter = createDevReportsWriter({ rootDir: tmpDir });
    const ctx = makeToolContext({ services: { devReportsWriter } });

    const result = await reportIssueTool.handler(
      {
        kind: "confusing-tool",
        summary: "The tool description is very unclear",
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.file).toMatch(/\.md$/);
    // File should be inside our tmpDir
    expect(result.file.startsWith(tmpDir)).toBe(true);
  });

  it("passes all optional fields through to the writer", async () => {
    const devReportsWriter = createDevReportsWriter({ rootDir: tmpDir });
    const ctx = makeToolContext({ services: { devReportsWriter } });

    const result = await reportIssueTool.handler(
      {
        kind: "broken-result",
        summary: "Tool returned empty result unexpectedly",
        severity: "high",
        tool_ref: "grade_math",
        fragment_ref: "math-grading-instructions",
        details: "The result was `null` even though the input was valid.",
      },
      ctx,
    );

    expect(result.ok).toBe(true);

    // Read back the file and verify optional fields were written.
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(result.file, "utf8");
    expect(content).toContain("severity: high");
    expect(content).toContain("tool_ref: grade_math");
    expect(content).toContain("fragment_ref: math-grading-instructions");
    expect(content).toContain("The result was");
  });

  it("uses ctx.modeId in the report", async () => {
    const devReportsWriter = createDevReportsWriter({ rootDir: tmpDir });
    const ctx = makeToolContext({ services: { devReportsWriter }, modeId: "quiz" });

    const result = await reportIssueTool.handler(
      { kind: "other", summary: "Something odd happened here" },
      ctx,
    );

    expect(result.ok).toBe(true);
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(result.file, "utf8");
    expect(content).toContain("mode_id: quiz");
  });

  it("falls back to 'unknown' for modeId when not on ctx", async () => {
    const devReportsWriter = createDevReportsWriter({ rootDir: tmpDir });
    // makeToolContext does not set modeId by default.
    const ctx = makeToolContext({ services: { devReportsWriter } });

    const result = await reportIssueTool.handler(
      { kind: "other", summary: "Something odd happened here" },
      ctx,
    );

    expect(result.ok).toBe(true);
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(result.file, "utf8");
    expect(content).toContain("mode_id: unknown");
  });

  it("throws DEV_REPORTS_UNAVAILABLE when writer is missing from services", async () => {
    // Do NOT pass devReportsWriter — the proxy returns a vi.fn() auto-stub
    // for unknown service keys, but devReportsWriter is explicitly undefined here.
    const ctx = makeToolContext({ services: { devReportsWriter: undefined } });

    await expect(
      reportIssueTool.handler({ kind: "other", summary: "Should fail gracefully" }, ctx),
    ).rejects.toThrow("DEV_REPORTS_UNAVAILABLE");
  });
});
