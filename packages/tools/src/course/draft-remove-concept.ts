import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  name: z.string().min(1).describe("Exact concept name to remove (case-insensitive match)."),
});

const OutputSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const draftRemoveConceptTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_remove_concept",
  description:
    "Remove a concept from the draft. Also removes all edges and lesson references to that concept.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) return { ok: false as const, reason: "no draftId in args or session context" };
    const result = await ctx.services.bootstrap.removeConcept({ draftId, name: args.name });
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, reason: result.reason ?? "unknown error" };
  },
};
