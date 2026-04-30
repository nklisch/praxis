import { brandId } from "@praxis/core/types";
import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  courseId: z.string().optional().describe("Filter notes by course ID."),
  lessonId: z.string().optional().describe("Filter notes by lesson ID."),
  format: z
    .enum(["cornell", "feynman", "outline", "free"])
    .optional()
    .describe("Filter notes by format."),
  limit: z.number().int().positive().max(200).optional().describe("Maximum notes to return (default 100)."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  notes: z.array(z.unknown()),
  count: z.number().int(),
});

export const listNotesTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "note.list",
  description:
    "List the student's notes with optional filters by course, lesson, or format. Returns notes ordered most-recently-updated first.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const notes = await ctx.services.notes.list({
      studentId: ctx.studentId,
      ...(args.courseId !== undefined && { courseId: brandId<"CourseId">(args.courseId) }),
      ...(args.lessonId !== undefined && { lessonId: brandId<"LessonId">(args.lessonId) }),
      ...(args.format !== undefined && { format: args.format }),
      ...(args.limit !== undefined && { limit: args.limit }),
    });
    return { ok: true, notes, count: notes.length };
  },
};
