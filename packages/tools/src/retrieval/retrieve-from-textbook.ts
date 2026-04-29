import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";
import { reciprocalRankFusion } from "./rrf.js";

export const retrieveFromTextbookInput = z.object({
  query: z
    .string()
    .min(1)
    .describe("A natural-language question or topic to search the student's textbooks for."),
  topK: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("How many citations to return. Default 5; rarely need more than 10."),
  documentIds: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict search to specific document IDs. Default: search all of the student's documents.",
    ),
  sectionPattern: z
    .string()
    .optional()
    .describe(
      "Restrict to chunks whose section name contains this substring (case-insensitive). " +
        "Useful for 'chapter 3' or 'photosynthesis' style filtering when you know the section.",
    ),
  pageRange: z
    .object({
      from: z.number().int().min(1),
      to: z.number().int().min(1),
    })
    .optional()
    .describe(
      "Restrict to a page range (inclusive). Useful when the student references specific pages.",
    ),
});

export const retrieveFromTextbookOutput = z.object({
  query: z.string(),
  citations: z.array(
    z.object({
      index: z.number().int(),
      documentId: z.string(),
      documentTitle: z.string(),
      chunkId: z.string(),
      chunkText: z.string(),
      page: z.number().int().optional(),
      section: z.string().optional(),
      hasPageImage: z.boolean().optional(),
      score: z.number(),
    }),
  ),
});

/** Overfetch multiplier: each index returns topK * 2 before RRF fusion. */
const VECTOR_OVERFETCH = 2;

export const retrieveFromTextbookTool: ToolDefinition<
  typeof retrieveFromTextbookInput,
  typeof retrieveFromTextbookOutput
> = {
  name: "retrieve_from_textbook",
  description: `Search the student's uploaded textbooks for relevant passages and return ranked citations. Uses HYBRID retrieval (semantic + lexical) — vector embeddings for paraphrase matches plus BM25 for exact-term matches, combined via reciprocal rank fusion.

Use this for ANY claim that should be grounded in the student's course material — definitions, examples, derivations, formulas, historical facts, etc.

Refer to citations as [1], [2], etc. matching the order they appear in the result. The student's UI renders these as clickable chips that show the source chunk.

Filters (use when the student gives you a hint):
- documentIds: limit to specific documents (e.g., only the biology textbook)
- sectionPattern: restrict to a section by substring (e.g., "chapter 3" or "respiration")
- pageRange: restrict to a page range (e.g., pages 40-50)

If retrieval returns nothing useful, say so explicitly. Don't invent connections. Recommend the student upload more material if relevant.`,
  input: retrieveFromTextbookInput,
  output: retrieveFromTextbookOutput,
  tier: "grounded",
  effects: ["external.code-exec"],

  async handler(args, ctx: ToolContext) {
    const { embeddings, vectorStore, ftsStore, documents } = ctx.services;

    // Asymmetric query encoding — adds ~5-10% retrieval quality for bge-small
    const queryVec = await embeddings.embedQuery(args.query);

    const overfetch = args.topK * VECTOR_OVERFETCH;

    // Build shared filter args (only include when defined)
    const filterArgs = {
      ...(args.documentIds !== undefined && { documentIds: args.documentIds }),
      ...(args.sectionPattern !== undefined && { sectionPattern: args.sectionPattern }),
      ...(args.pageRange !== undefined && { pageRange: args.pageRange }),
    };

    // Hybrid: parallel vector + BM25
    const [vectorHits, ftsHits] = await Promise.all([
      vectorStore.search({ embedding: queryVec, topK: overfetch, ...filterArgs }),
      ftsStore.search({ query: args.query, topK: overfetch, ...filterArgs }),
    ]);

    // Fuse via RRF
    const fused = reciprocalRankFusion(vectorHits, ftsHits, args.topK);

    if (fused.length === 0) {
      return { query: args.query, citations: [] };
    }

    // Hydrate document titles
    const docIds = [...new Set(fused.map((r) => r.documentId))];
    const titles = await documents.titlesByIds(docIds);

    // Mark which chunks have a saved page image (lightweight — pageImage returns null when absent)
    const citations = await Promise.all(
      fused.map(async (r, i) => {
        let hasPageImage = false;
        if (r.page !== undefined) {
          const img = await documents.pageImage({ documentId: r.documentId, page: r.page });
          hasPageImage = img !== null;
        }
        return {
          index: i + 1,
          documentId: r.documentId,
          documentTitle: titles.get(r.documentId) ?? "(unknown)",
          chunkId: r.chunkId,
          chunkText: r.chunkText,
          ...(r.page !== undefined && { page: r.page }),
          ...(r.section !== undefined && { section: r.section }),
          ...(hasPageImage && { hasPageImage: true }),
          score: r.score,
        };
      }),
    );

    return { query: args.query, citations };
  },
};
