import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  assessments: z
    .array(
      z.object({
        draftLessonId: z.string().describe("Lesson this assessment attaches to."),
        title: z.string().min(1).describe("Assessment title."),
        kind: z.enum(["quiz", "homework", "exam"]),
        timing: z.enum(["before", "after", "interleaved"]),
        purpose: z.enum(["readiness", "practice", "checkpoint"]),
        conceptNames: z
          .array(z.string())
          .min(1)
          .describe("Concept names from the draft this assessment covers."),
        expectedItemCount: z.number().int().min(1).max(50).optional(),
        rationale: z
          .string()
          .min(1)
          .describe("Why this assessment is here / what it should verify."),
      }),
    )
    .min(1)
    .describe("Lesson-attached assessments to schedule. Each is independently validated."),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  results: z.array(
    z.union([
      z.object({
        ok: z.literal(true),
        title: z.string(),
        draftAssessmentId: z.string(),
      }),
      z.object({ ok: z.literal(false), title: z.string(), reason: z.string() }),
    ]),
  ),
});

export const draftAddLessonAssessmentsTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: "course.draft_add_lesson_assessments",
  description:
    "Schedule many per-lesson assessments (homework, quiz, readiness check) in one tool call. Each draftLessonId must exist; each conceptName must be in the draft. Costs one step regardless of array length — prefer this over course.draft_add_lesson_assessment for the standard homework-after-every-lesson pattern. Per-item failures are reported in `results` without aborting the rest.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) {
      return {
        ok: false,
        results: args.assessments.map((a) => ({
          ok: false as const,
          title: a.title,
          reason: "no draftId in args or session context",
        })),
      };
    }
    const results: Array<
      | { ok: true; title: string; draftAssessmentId: string }
      | { ok: false; title: string; reason: string }
    > = [];
    let allOk = true;
    for (const a of args.assessments) {
      const r = await ctx.services.bootstrap.addLessonAssessment({
        draftId,
        draftLessonId: a.draftLessonId,
        title: a.title,
        kind: a.kind,
        timing: a.timing,
        purpose: a.purpose,
        conceptNames: a.conceptNames,
        ...(a.expectedItemCount !== undefined && { expectedItemCount: a.expectedItemCount }),
        rationale: a.rationale,
      });
      if (r.ok) {
        results.push({ ok: true, title: a.title, draftAssessmentId: r.draftAssessmentId });
      } else {
        allOk = false;
        results.push({ ok: false, title: a.title, reason: r.reason });
      }
    }
    return { ok: allOk, results };
  },
};
