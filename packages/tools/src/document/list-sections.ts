import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  documentId: z.string().min(1).describe("The document id to list sections for."),
});

const OutputSchema = z.object({
  documentId: z.string(),
  documentTitle: z.string(),
  sections: z.array(
    z.object({
      section: z.string(),
      firstPage: z.number().int().optional(),
      lastPage: z.number().int().optional(),
      chunkCount: z.number().int(),
    }),
  ),
});

export const documentListSectionsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "document.list_sections",
  description:
    "List the sections (chapters, headings) of a document with page ranges and chunk counts. Use this to get a deterministic overview of a textbook's structure before deciding which sections to read in detail. Faster and more reliable than retrieve_from_textbook for 'what's in this book' questions.",
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

    // Aggregate sections: group by section name, compute min/max page + count
    type SectionAgg = { firstPage?: number; lastPage?: number; chunkCount: number };
    const sectionMap = new Map<string, SectionAgg>();

    for (const chunk of chunks) {
      const section = chunk.section ?? "(no section)";
      const existing = sectionMap.get(section);
      if (existing === undefined) {
        sectionMap.set(section, {
          ...(chunk.page != null && { firstPage: chunk.page, lastPage: chunk.page }),
          chunkCount: 1,
        });
      } else {
        if (chunk.page != null) {
          if (existing.firstPage === undefined || chunk.page < existing.firstPage) {
            existing.firstPage = chunk.page;
          }
          if (existing.lastPage === undefined || chunk.page > existing.lastPage) {
            existing.lastPage = chunk.page;
          }
        }
        existing.chunkCount += 1;
      }
    }

    const sections = Array.from(sectionMap.entries()).map(([section, agg]) => ({
      section,
      ...(agg.firstPage !== undefined && { firstPage: agg.firstPage }),
      ...(agg.lastPage !== undefined && { lastPage: agg.lastPage }),
      chunkCount: agg.chunkCount,
    }));

    return { documentId: args.documentId, documentTitle, sections };
  },
};
