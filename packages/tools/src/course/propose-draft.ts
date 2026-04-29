import type { DocumentId, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  documentIds: z
    .array(z.string())
    .min(1)
    .describe("Document IDs to build the course from. Obtain these from course.list_documents."),
  courseTitle: z.string().min(1).describe("The desired course title."),
  subject: z.string().min(1).describe("Subject slug, e.g. 'math.algebra-1'."),
  gradeLevel: z.string().min(1).describe("Grade level, e.g. '9-12'."),
});

const OutputSchema = z.object({
  draftId: z.string(),
  summary: z.object({
    title: z.string(),
    lessonCount: z.number().int(),
    conceptCount: z.number().int(),
    edgeCount: z.number().int(),
    firstLessons: z.array(z.object({ title: z.string(), conceptCount: z.number().int() })),
  }),
});

export const proposeDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.propose_draft",
  description:
    "Propose a course draft from the student's ingested documents. Returns a draftId and summary; the full draft is shown via course.show_draft. This call may take 30-90 seconds for a textbook.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: ["none"], // draft is in-memory; only confirm_draft persists to DB
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const { draft, summary } = await ctx.services.bootstrap.proposeDraft({
      studentId: ctx.studentId,
      documentIds: args.documentIds.map((id) => id as DocumentId),
      courseTitle: args.courseTitle,
      subject: args.subject,
      gradeLevel: args.gradeLevel,
    });
    return { draftId: draft.draftId, summary };
  },
};
