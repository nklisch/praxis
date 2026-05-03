import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  fromName: z.string().min(1).describe("Prerequisite concept name (must already exist)."),
  toName: z.string().min(1).describe("Dependent concept name (must already exist)."),
  strength: z
    .number()
    .min(0)
    .max(1)
    .default(0.7)
    .describe("Edge strength: 0.9 = strict prerequisite, 0.3 = weak suggestion, 0.7 if uncertain."),
  rationale: z.string().describe("One-sentence explanation of why fromName is needed for toName."),
});

const OutputSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const draftAddEdgeTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_add_edge",
  description:
    "Add a prerequisite edge between two existing concepts. fromName must be learned before toName.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) return { ok: false as const, reason: "no draftId in args or session context" };
    return ctx.services.bootstrap.addEdge({
      draftId,
      fromName: args.fromName,
      toName: args.toName,
      strength: args.strength,
      rationale: args.rationale,
    });
  },
};
