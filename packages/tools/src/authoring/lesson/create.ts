import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  courseId: z.string().min(1).describe("The course to add the lesson to."),
  title: z.string().min(1).describe("Lesson title."),
  conceptIds: z
    .array(z.string().min(1))
    .describe("Concept IDs to include in this lesson. May be empty for a placeholder lesson."),
  orderIndex: z
    .number()
    .int()
    .optional()
    .describe("Position in the lesson sequence (0-based). Omit to append at the end."),
  estimatedMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Estimated time to complete this lesson in minutes. Default: 30."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  title: z.string(),
});

export const lessonCreateTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "lesson.create",
  description:
    "Add a new lesson to an existing course. Appends at the end by default (orderIndex omitted). Writes are logged to the configurator audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const courseId = brandId<"CourseId">(args.courseId);
    const conceptIds = args.conceptIds.map((id) => brandId<"ConceptId">(id));
    const result = await ctx.services.authoring.createLesson({
      courseId,
      title: args.title,
      conceptIds,
      ...(args.orderIndex !== undefined && { orderIndex: args.orderIndex }),
      ...(args.estimatedMinutes !== undefined && { estimatedMinutes: args.estimatedMinutes }),
    });
    return { ok: true, lessonId: result.id, title: result.title };
  },
};
