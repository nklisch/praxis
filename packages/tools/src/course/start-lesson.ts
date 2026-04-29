import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  lessonId: z.string().describe("The lesson ID to mark as in-progress."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  conceptIds: z.array(z.string()),
  references: z.array(z.any()),
  suggestedStrategy: z.string(),
  estimatedMinutes: z.number().int(),
});

export const startLessonTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.start_lesson",
  description:
    "Mark a lesson as in-progress for the current student. Returns the lesson's concept IDs, references, and suggested strategy.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const lessonId = brandId<"LessonId">(args.lessonId);
    await ctx.services.artifacts.markLessonStarted({ studentId: ctx.studentId, lessonId });

    // We need to read lesson details. ArtifactsService.lessons(courseId) requires courseId.
    // Instead, we do a direct lookup via courseState or expose a lesson(id) method.
    // For Phase 6: read from the snapshot if courseState is available.
    if (ctx.courseId) {
      const snap = await ctx.services.courseState.read({
        studentId: ctx.studentId,
        courseId: ctx.courseId,
      });
      const lesson = snap?.lessons.find((l) => l.id === lessonId);
      if (lesson) {
        return {
          ok: true,
          lessonId: lesson.id,
          conceptIds: lesson.conceptIds,
          references: lesson.references,
          suggestedStrategy: lesson.suggestedStrategy,
          estimatedMinutes: lesson.estimatedMinutes,
        };
      }
    }

    // Fallback: we marked it started, but can't provide lesson details without courseId.
    return {
      ok: true,
      lessonId: args.lessonId,
      conceptIds: [],
      references: [],
      suggestedStrategy: "worked-examples",
      estimatedMinutes: 45,
    };
  },
};
