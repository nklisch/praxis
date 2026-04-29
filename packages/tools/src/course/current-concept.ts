import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  courseId: z
    .string()
    .optional()
    .describe("The course ID to query. Omit to use the session's active course."),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    conceptId: z.string(),
    name: z.string(),
    description: z.string(),
    lessonId: z.string(),
  }),
  z.object({ kind: z.literal("all_complete"), courseId: z.string() }),
  z.object({ kind: z.literal("no_active_lesson"), courseId: z.string() }),
]);

export const currentConceptTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.current_concept",
  description:
    "Return the next un-studied concept in the current lesson, or signal that all concepts are studied.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const rawId = args.courseId ?? (ctx.courseId ? ctx.courseId : null);
    if (!rawId) {
      throw new Error(
        "course.current_concept requires either an explicit courseId argument or a session started with a courseId",
      );
    }
    const courseId = brandId<"CourseId">(rawId);
    const snap = await ctx.services.courseState.read({ studentId: ctx.studentId, courseId });
    if (!snap) {
      throw new Error(`Course not found for this student: ${rawId}`);
    }
    if (!snap.currentLesson) {
      return { kind: "all_complete", courseId: snap.course.id };
    }
    const conceptRows = snap.conceptsByLesson.get(snap.currentLesson.id) ?? [];
    const nextRow = conceptRows.find((c) => !c.studied);
    if (!nextRow) {
      // Current lesson has no un-studied concepts (shouldn't happen if lesson completion is tracked).
      return { kind: "all_complete", courseId: snap.course.id };
    }
    return {
      kind: "ok",
      conceptId: nextRow.conceptId,
      name: nextRow.name,
      description: nextRow.description,
      lessonId: snap.currentLesson.id,
    };
  },
};
