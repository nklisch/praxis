import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  courseId: z.string().min(1).describe("The course ID to edit."),
  patch: z
    .object({
      title: z.string().min(1).optional().describe("New course title."),
      subject: z.string().min(1).optional().describe("New subject string (e.g. 'math.algebra-1')."),
      gradeLevel: z.string().min(1).optional().describe("New grade level (e.g. '8')."),
    })
    .describe("Fields to update. Only provided fields are changed."),
  reason: z.string().optional().describe("Optional reason for this edit (logged to audit trail)."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  courseId: z.string(),
  title: z.string(),
});

export const courseEditTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.edit",
  description:
    "Update course metadata (title, subject, grade level). Use when the configurator wants to rename a course or correct its metadata. Writes are logged to the configurator audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const courseId = brandId<"CourseId">(args.courseId);
    const patch: { title?: string; subject?: string; gradeLevel?: string } = {};
    if (args.patch.title !== undefined) patch.title = args.patch.title;
    if (args.patch.subject !== undefined) patch.subject = args.patch.subject;
    if (args.patch.gradeLevel !== undefined) patch.gradeLevel = args.patch.gradeLevel;
    const result = await ctx.services.authoring.updateCourse({
      courseId,
      patch,
      ...(args.reason !== undefined && { reason: args.reason }),
    });
    return { ok: true, courseId: result.id, title: result.title };
  },
};
