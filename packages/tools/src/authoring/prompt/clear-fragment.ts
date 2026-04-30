import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  modeId: z.string().min(1).describe("Mode ID of the override to remove."),
  fragmentId: z.string().min(1).describe("Fragment ID of the override to remove."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  modeId: z.string(),
  fragmentId: z.string(),
});

export const promptClearFragmentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "prompt.clear_fragment",
  description:
    "Remove a custom fragment override and restore the default template for the given (modeId, fragmentId) pair. No-op if no override exists. Logged to audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    await ctx.services.authoring.clearFragmentOverride({
      modeId: args.modeId,
      fragmentId: args.fragmentId,
    });
    return { ok: true, modeId: args.modeId, fragmentId: args.fragmentId };
  },
};
