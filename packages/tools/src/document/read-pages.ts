import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  documentId: z.string().min(1).describe("The document id to read pages from."),
  fromPage: z.number().int().min(1).describe("First page to include (inclusive)."),
  toPage: z.number().int().min(1).describe("Last page to include (inclusive)."),
  maxChunks: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum number of chunks to return. Default 20; hard cap 50."),
});

const OutputSchema = z.object({
  documentId: z.string(),
  page: z.object({ from: z.number(), to: z.number() }),
  chunks: z.array(
    z.object({
      chunkIndex: z.number(),
      page: z.number().optional(),
      section: z.string().optional(),
      text: z.string(),
    }),
  ),
  truncated: z.boolean(),
});

export const documentReadPagesTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "document.read_pages",
  description:
    "Read a specific page range of a document and return the chunks in document order. Use this when you've identified a section you want to read in full (e.g., from list_sections) — semantic search would be wasteful when you already know the location. Capped at 50 chunks; if the range exceeds the cap, the response is truncated and truncated=true is set.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const allChunks = await ctx.services.documents.chunksForDocument({
      documentId: args.documentId,
      studentId: ctx.studentId,
    });

    // Filter by page range (chunks without a page are excluded when a page range is given)
    const inRange = allChunks.filter(
      (c) => c.page !== undefined && c.page >= args.fromPage && c.page <= args.toPage,
    );

    // Chunks are already ordered by chunkIndex from the reader
    const truncated = inRange.length > args.maxChunks;
    const sliced = inRange.slice(0, args.maxChunks);

    return {
      documentId: args.documentId,
      page: { from: args.fromPage, to: args.toPage },
      chunks: sliced.map((c) => ({
        chunkIndex: c.chunkIndex,
        ...(c.page !== undefined && { page: c.page }),
        ...(c.section !== undefined && { section: c.section }),
        text: c.text,
      })),
      truncated,
    };
  },
};
