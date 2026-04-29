import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  courseId: z
    .string()
    .optional()
    .describe("The course ID to query. Omit to use the session's active course."),
});

const OutputSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  currentLesson: z
    .object({
      lessonId: z.string(),
      title: z.string(),
      conceptCount: z.number().int(),
      studiedConceptCount: z.number().int(),
    })
    .nullable(),
  nextConceptToStudy: z
    .object({
      conceptId: z.string(),
      name: z.string(),
      description: z.string(),
    })
    .nullable(),
  completed: z.boolean(),
});

export const whatCanITeachTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.what_can_i_teach",
  description:
    "Return the active course's current lesson and the next concept to teach. Call this at the start of a tutoring turn when you need to orient yourself; the system prompt includes a snapshot but this tool gives a fresh read.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const rawId = args.courseId ?? requireSessionCourseId(ctx);
    const courseId = brandId<"CourseId">(rawId);
    const snap = await ctx.services.courseState.read({ studentId: ctx.studentId, courseId });
    if (!snap) {
      throw new Error(`Course not found for this student: ${rawId}`);
    }
    if (!snap.currentLesson) {
      return {
        courseId: snap.course.id,
        courseTitle: snap.course.title,
        currentLesson: null,
        nextConceptToStudy: null,
        completed: true,
      };
    }
    const conceptRows = snap.conceptsByLesson.get(snap.currentLesson.id) ?? [];
    const nextRow = conceptRows.find((c) => !c.studied) ?? null;
    return {
      courseId: snap.course.id,
      courseTitle: snap.course.title,
      currentLesson: {
        lessonId: snap.currentLesson.id,
        title: snap.currentLesson.title,
        conceptCount: conceptRows.length,
        studiedConceptCount: conceptRows.filter((c) => c.studied).length,
      },
      nextConceptToStudy: nextRow
        ? { conceptId: nextRow.conceptId, name: nextRow.name, description: nextRow.description }
        : null,
      completed: false,
    };
  },
};

function requireSessionCourseId(ctx: ToolContext): string {
  if (ctx.courseId) return ctx.courseId;
  throw new Error(
    "course.what_can_i_teach requires either an explicit courseId argument or a session started with a courseId",
  );
}
