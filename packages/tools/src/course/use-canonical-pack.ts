import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  packId: z
    .string()
    .min(1)
    .describe(
      "The pack id to use (e.g., 'algebra-1'). Must match a pack listed by course.list_canonical_packs.",
    ),
  courseTitle: z.string().min(1).describe("Display title for the new course."),
  gradeLevel: z.string().min(1).describe("Grade level for the course (e.g., '9-12')."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  courseId: z.string(),
  conceptGraphId: z.string(),
  conceptCount: z.number().int(),
});

export const useCanonicalPackTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.use_canonical_pack",
  description:
    "Create a course from a canonical knowledge pack instead of running the bootstrap explorer. The pack's concept graph + prerequisite edges become the course's structure. Use this when the student wants a curated curriculum rather than building from their own materials. The pack is imported automatically if not already imported (idempotent).",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    // 1. Ensure pack is imported (idempotent — same version = no-op).
    const imported = await ctx.services.packs.importPack(args.packId);

    // 2. Create a course pointing at the canonical conceptGraphId.
    const course = await ctx.services.bootstrap.createCourseFromPack({
      studentId: ctx.studentId,
      packId: args.packId,
      conceptGraphId: imported.conceptGraphId,
      courseTitle: args.courseTitle,
      gradeLevel: args.gradeLevel,
    });

    return {
      ok: true,
      courseId: course.courseId,
      conceptGraphId: imported.conceptGraphId,
      conceptCount: course.conceptCount,
    };
  },
};
