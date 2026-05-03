import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  documentId: z.string().min(1).describe("The document id to outline."),
});

const OutputSchema = z.object({
  documentId: z.string(),
  documentTitle: z.string(),
  pageCount: z.number().int().optional(),
  chunkCount: z.number().int(),
  sectionCount: z.number().int(),
  /** First chunk's first 200 chars — usually the title page or preface. */
  preview: z.string(),
});

export const documentOutlineTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "document.outline",
  description:
    "Single-call summary of a document: page count, chunk count, section count, and a short preview. Cheapest way to orient before deciding whether to list sections or do retrieval. Always call this first when you encounter a new document.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const chunks = await ctx.services.documents.chunksForDocument({
      documentId: args.documentId,
      studentId: ctx.studentId,
    });

    // Hydrate document title
    const titles = await ctx.services.documents.titlesByIds([args.documentId]);
    const documentTitle = titles.get(args.documentId) ?? "(unknown)";

    // Compute pageCount: max page found across chunks
    let maxPage: number | undefined;
    const sectionNames = new Set<string>();
    const firstChunk = chunks[0];

    for (const chunk of chunks) {
      if (chunk.page !== undefined) {
        if (maxPage === undefined || chunk.page > maxPage) {
          maxPage = chunk.page;
        }
      }
      if (chunk.section !== undefined) {
        sectionNames.add(chunk.section);
      }
    }

    const preview = firstChunk !== undefined ? firstChunk.text.slice(0, 200) : "";

    return {
      documentId: args.documentId,
      documentTitle,
      ...(maxPage !== undefined && { pageCount: maxPage }),
      chunkCount: chunks.length,
      sectionCount: sectionNames.size,
      preview,
    };
  },
};
