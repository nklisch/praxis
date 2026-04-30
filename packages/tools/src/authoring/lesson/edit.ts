import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  lessonId: z.string().min(1).describe("The lesson ID to edit."),
  patch: z
    .object({
      title: z.string().min(1).optional().describe("New lesson title."),
      conceptIds: z
        .array(z.string().min(1))
        .optional()
        .describe("Replace the full concept ID list (all concepts in order)."),
      estimatedMinutes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Updated estimated minutes."),
    })
    .describe("Fields to update. Only provided fields are changed."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  title: z.string(),
});

export const lessonEditTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "lesson.edit",
  description:
    "Update a lesson's title, concept list, or estimated time. Replacing conceptIds replaces the entire ordered list — pass the full desired list. Writes are logged to the configurator audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const lessonId = brandId<"LessonId">(args.lessonId);
    const patch: {
      title?: string;
      conceptIds?: ReturnType<typeof brandId<"ConceptId">>[];
      estimatedMinutes?: number;
    } = {};
    if (args.patch.title !== undefined) patch.title = args.patch.title;
    if (args.patch.conceptIds !== undefined) {
      patch.conceptIds = args.patch.conceptIds.map((id) => brandId<"ConceptId">(id));
    }
    if (args.patch.estimatedMinutes !== undefined) {
      patch.estimatedMinutes = args.patch.estimatedMinutes;
    }
    const result = await ctx.services.authoring.updateLesson({ lessonId, patch });
    return { ok: true, lessonId: result.id, title: result.title };
  },
};
