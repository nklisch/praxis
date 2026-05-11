import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().describe("The draft ID to inspect."),
  draftLessonId: z.string().describe("The lesson to retrieve full detail for."),
});

const OutputSchema = z.object({
  draftLessonId: z.string(),
  title: z.string(),
  conceptNames: z.array(z.string()),
  assessments: z.array(
    z.object({
      draftAssessmentId: z.string(),
      kind: z.enum(["quiz", "homework", "exam"]),
      timing: z.enum(["before", "after", "interleaved"]),
      purpose: z.enum(["readiness", "practice", "checkpoint"]),
      title: z.string(),
    }),
  ),
  parentUnit: z
    .object({
      draftUnitId: z.string(),
      name: z.string(),
    })
    .nullable(),
});

export const getLessonDetailTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.get_lesson_detail",
  description:
    "Return full detail for a specific draft lesson: concept names, lesson assessments (with kind/timing/purpose), and the parent unit if the lesson is grouped into one.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) throw new Error("draftId is required (pass as arg or open from a draft session)");

    const result = await ctx.services.bootstrap.getLessonDetail({
      draftId,
      draftLessonId: args.draftLessonId,
    });
    if (result === null) {
      throw new Error(
        `Draft or lesson not found. draftId=${draftId} draftLessonId=${args.draftLessonId}`,
      );
    }

    return result;
  },
};
