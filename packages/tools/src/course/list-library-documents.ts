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
      attachedToCurrentCourse: z.boolean(),
    }),
  ),
});

export const listLibraryDocumentsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_library_documents",
  description:
    "List ALL documents in the student's library, with a flag showing which are already attached to the active course. Use this when the user wants to add a previously-ingested document to the current course, or to see what's available across the library. In bootstrap mode (no course yet), attachedToCurrentCourse is always false.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(_args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const docs = await ctx.services.artifacts.listDocuments(ctx.studentId);
    const attached = new Set(ctx.courseDocumentIds ?? []);
    return {
      documents: docs.map((d) => ({
        documentId: d.documentId,
        filename: d.filename,
        mimeType: d.mimeType,
        chunkCount: d.chunkCount,
        hasPageImages: d.hasPageImages,
        attachedToCurrentCourse: attached.has(d.documentId),
      })),
    };
  },
};
