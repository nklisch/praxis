import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  subject: z
    .string()
    .optional()
    .describe("Filter by subject id (e.g., 'math.algebra-1'). Omit to list all available packs."),
});

const OutputSchema = z.object({
  packs: z.array(
    z.object({
      id: z.string(),
      version: z.string(),
      name: z.string(),
      subject: z.string(),
      gradeLevel: z.string(),
      conceptCount: z.number().int(),
      edgeCount: z.number().int(),
      imported: z.boolean(),
    }),
  ),
});

export const listCanonicalPacksTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_canonical_packs",
  description:
    "List available canonical knowledge packs (curated concept graphs for specific subjects). Use this in course-create mode when the student names a subject — if a matching pack exists, you can offer it as an alternative to having the drafter extract concepts from documents. If a pack's 'imported' field is true, it is ready to use with course.use_canonical_pack.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const all = await ctx.services.packs.listAvailablePacks();
    const filtered = args.subject ? all.filter((p) => p.subject === args.subject) : all;
    return { packs: filtered };
  },
};
