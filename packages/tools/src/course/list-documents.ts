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

export const listDocumentsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_documents",
  description:
    "List the student's ingested documents. Use this in bootstrap mode to see what materials are available before proposing a course draft.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(_args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const docs = await ctx.services.artifacts.listDocuments(ctx.studentId);
    return {
      documents: docs.map((d) => ({
        documentId: d.documentId,
        filename: d.filename,
        mimeType: d.mimeType,
        chunkCount: d.chunkCount,
        hasPageImages: d.hasPageImages,
      })),
    };
  },
};
