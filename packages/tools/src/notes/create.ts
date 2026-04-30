import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { NoteBodySchema } from "./schema.js";

const InputSchema = z.object({
  format: z.enum(["cornell", "feynman", "outline", "free"]),
  body: NoteBodySchema,
  context: z
    .object({
      courseId: z.string().optional(),
      lessonId: z.string().optional(),
      sessionId: z.string().optional(),
      conceptIds: z.array(z.string()).optional(),
    })
    .optional(),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  noteId: z.string(),
});

export const createNoteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "note.create",
  description:
    "Create a structured note for the student in one of four formats: cornell (questions + details + summary), feynman (explanation + follow-ups), outline (recursive bullet tree), or free (plain text). Each value field can contain markdown. Pass context.courseId, context.lessonId, context.sessionId, and context.conceptIds to link the note for later filtering.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    // biome-ignore lint/suspicious/noExplicitAny: NoteBody discriminated union passed through
    const note = await ctx.services.notes.create({
      studentId: ctx.studentId,
      format: args.format,
      body: args.body as any,
      ...(args.context !== undefined && {
        context: {
          ...(args.context.courseId !== undefined && {
            courseId: brandId<"CourseId">(args.context.courseId),
          }),
          ...(args.context.lessonId !== undefined && {
            lessonId: brandId<"LessonId">(args.context.lessonId),
          }),
          ...(args.context.sessionId !== undefined && {
            sessionId: args.context.sessionId,
          }),
          ...(args.context.conceptIds !== undefined && {
            conceptIds: args.context.conceptIds.map((id) => brandId<"ConceptId">(id)),
          }),
        },
      }),
    });
    return { ok: true, noteId: note.id };
  },
};
