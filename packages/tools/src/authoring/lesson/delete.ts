import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  lessonId: z.string().min(1).describe("The lesson ID to delete."),
  reason: z
    .string()
    .min(1)
    .describe(
      "Required reason for deletion — logged to the audit trail. Example: 'Combined with Lesson 2'.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
});

export const lessonDeleteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "lesson.delete",
  description:
    "Delete a lesson and cascade: removes lesson_progress rows and any gates whose guards reference this lesson. DESTRUCTIVE — always confirm with the configurator before calling. Reason is required and logged.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const lessonId = brandId<"LessonId">(args.lessonId);
    await ctx.services.authoring.deleteLesson({ lessonId, reason: args.reason });
    return { ok: true, lessonId };
  },
};
