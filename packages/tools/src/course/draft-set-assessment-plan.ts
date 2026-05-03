import type { AssessmentPlan, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";
import { AssessmentPlanSchema } from "./assessment-plan-schema.js";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  plan: AssessmentPlanSchema.describe("Overall assessment scaffold shape for the course."),
});

const OutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const draftSetAssessmentPlanTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_set_assessment_plan",
  description:
    "Declare the overall assessment scaffold shape for the course (homework cadence, quiz frequency, summative kinds). Call this once before adding units and lesson assessments.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) return { ok: false as const, reason: "no draftId in args or session context" };
    return ctx.services.bootstrap.setAssessmentPlan({
      draftId,
      plan: args.plan as AssessmentPlan,
    });
  },
};
