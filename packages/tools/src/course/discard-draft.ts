import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().describe("The draft ID to discard."),
});

const OutputSchema = z.object({ ok: z.literal(true) });

export const discardDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.discard_draft",
  description:
    "Drop an in-memory draft. Use this when the user wants to start over from scratch without confirming.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    await ctx.services.bootstrap.discardDraft(args.draftId);
    return { ok: true };
  },
};
