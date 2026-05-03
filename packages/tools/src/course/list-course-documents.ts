import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({});

const OutputSchema = z.object({
  documents: z.array(
    z.object({
      documentId: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      chunkCount: z.number().int(),
      hasPageImages: z.boolean(),
    }),
  ),
});

export const listCourseDocumentsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_course_documents",
  description:
    "List documents attached to the active course. Use this in teach/configure modes when the user asks 'what materials does this course have?'. Errors if no course is in scope.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(_args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    if (ctx.courseId === undefined) {
      throw new Error("course.list_course_documents requires a course-scoped session");
    }
    const detailed = await ctx.services.courseDocuments.listForCourseDetailed(ctx.courseId);
    return {
      documents: detailed.map((d) => ({
        documentId: d.documentId,
        filename: d.filename,
        mimeType: d.mimeType,
        chunkCount: d.chunkCount,
        hasPageImages: d.hasPageImages,
      })),
    };
  },
};
