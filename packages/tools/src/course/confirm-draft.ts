import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().describe("The draft ID to confirm and persist."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  courseId: z.string(),
  lessonIds: z.array(z.string()),
  conceptGraphId: z.string(),
});

export const confirmDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.confirm_draft",
  description:
    "Persist the draft as a real course. After this call, the course appears in the student's course list and is selectable for teach sessions. The draft is removed from the cache.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const result = await ctx.services.bootstrap.confirmDraft({
      draftId: args.draftId,
      studentId: ctx.studentId,
    });
    return {
      ok: true,
      courseId: result.courseId,
      lessonIds: result.lessonIds,
      conceptGraphId: result.conceptGraphId,
    };
  },
};
