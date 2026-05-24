/**
 * `dev.report_issue` — dev-only tool that lets the agent surface confusing or
 * broken affordances back to the developer.
 *
 * The tool is registered only when `PRAXIS_DEV === "true"` (gated at
 * services-build time in step-2). If somehow called with the writer absent,
 * the handler throws so the registry wraps it as a non-fatal `tool.handler_threw`
 * result — the agent should interpret this as "dev surface unavailable".
 */
import type { ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

// ── Input schema ──────────────────────────────────────────────────────────────

export const ReportIssueInput = z.object({
  kind: z
    .enum([
      "confusing-tool",
      "contradictory-prompt",
      "missing-tool",
      "broken-result",
      "cant-execute",
      "other",
    ])
    .describe(
      "The category of issue being reported. Use 'confusing-tool' for unclear tool descriptions, " +
        "'contradictory-prompt' for conflicting instructions, 'missing-tool' for expected tools that " +
        "aren't available, 'broken-result' for malformed or unexpected tool outputs, " +
        "'cant-execute' for tasks that cannot be completed due to harness gaps, " +
        "and 'other' for anything else.",
    ),
  summary: z.string().min(1).max(200).describe("One-line description of the issue (≤ 200 chars)."),
  severity: z
    .enum(["low", "med", "high"])
    .optional()
    .describe(
      "Subjective severity. 'high' = blocks correct behaviour; 'med' = causes confusion; 'low' = minor nit.",
    ),
  tool_ref: z.string().optional().describe("Name of the specific tool being criticised, if any."),
  fragment_ref: z.string().optional().describe("Prompt-fragment id being criticised, if any."),
  details: z
    .string()
    .optional()
    .describe("Long-form Markdown body with additional context, examples, or suggestions."),
});

// ── Output schema ─────────────────────────────────────────────────────────────

export const ReportIssueOutput = z.object({
  ok: z.literal(true),
  file: z.string().describe("Absolute path to the written report file."),
});

// ── Tool definition ───────────────────────────────────────────────────────────

export const reportIssueTool: ToolDefinition<typeof ReportIssueInput, typeof ReportIssueOutput> = {
  name: "dev.report_issue",
  description:
    "Dev-only: report a confusing tool description, contradictory prompt, missing tool, " +
    "broken result, or unexecutable instruction back to the developer. " +
    "Use proactively rather than guessing or failing silently — reports land in " +
    "`.praxis/dev-reports/` as Markdown files the developer reads between turns.",
  input: ReportIssueInput,
  output: ReportIssueOutput,
  tier: "deterministic",
  effects: ["filesystem"],
  async handler(args, ctx) {
    const writer = ctx.services.devReportsWriter;
    if (!writer) {
      throw new Error("DEV_REPORTS_UNAVAILABLE: dev-reports writer not configured");
    }

    const { filePath } = await writer.writeReport({
      kind: args.kind,
      summary: args.summary,
      ...(args.severity !== undefined && { severity: args.severity }),
      ...(args.tool_ref !== undefined && { toolRef: args.tool_ref }),
      ...(args.fragment_ref !== undefined && { fragmentRef: args.fragment_ref }),
      ...(args.details !== undefined && { details: args.details }),
      sessionId: ctx.sessionId,
      modeId: ctx.modeId ?? "unknown",
      timestamp: new Date().toISOString(),
    });

    return { ok: true, file: filePath };
  },
};
