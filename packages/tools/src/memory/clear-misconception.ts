import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  misconceptionId: z
    .string()
    .min(1)
    .describe(
      "The misconception ID to clear. Use memory.misconceptions to list and find the ID.",
    ),
  reason: z
    .string()
    .min(1)
    .describe(
      "Required reason — logged to the audit trail. Example: 'False positive — student answered correctly on review'.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  misconceptionId: z.string(),
});

export const clearMisconceptionTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "memory.clear_misconception",
  description:
    "Mark a misconception as 'manually-cleared'. Use when the misconception was a false positive or has been remediated outside the system. Does not delete the row — sets status to manually-cleared and updates lastObservedAt. Reason required; logged.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["memory.write"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const misconceptionId = brandId<"MisconceptionId">(args.misconceptionId);
    await ctx.services.authoring.clearMisconception({
      misconceptionId,
      reason: args.reason,
    });
    return { ok: true, misconceptionId };
  },
};
