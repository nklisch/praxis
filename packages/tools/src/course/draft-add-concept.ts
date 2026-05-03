import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  name: z
    .string()
    .min(1)
    .describe("Concept name (1-4 words, no jargon the student wouldn't know)."),
  description: z.string().min(1).describe("One-sentence description of the concept."),
});

const OutputSchema = z.union([
  z.object({ ok: z.literal(true), conceptCount: z.number().int() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const draftAddConceptTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_add_concept",
  description:
    "Add one concept to the draft. Names are case-insensitively unique — returns ok:false if the concept already exists.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) return { ok: false as const, reason: "no draftId in args or session context" };
    return ctx.services.bootstrap.addConcept({
      draftId,
      name: args.name,
      description: args.description,
    });
  },
};
