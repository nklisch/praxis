import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  confirm: z
    .literal(true)
    .describe(
      "Must be exactly true. The agent must get explicit confirmation from the configurator before passing this.",
    ),
  reason: z
    .string()
    .min(1)
    .describe(
      "Required reason — logged to the audit trail. Example: 'Student restarting the course from scratch'.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
});

export const memoryDeleteAllTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "memory.delete_all",
  description:
    "Wipe all student memory: clears projection tables (mastery, misconceptions) and marks episodic rows as redacted. The episodic rows themselves are NOT deleted. HIGHLY DESTRUCTIVE — always get explicit confirmation ('yes, delete all memory') before calling. Reason required; logged.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["memory.write"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    await ctx.services.authoring.deleteAllMemory({
      studentId: ctx.studentId,
      reason: args.reason,
      confirm: args.confirm,
    });
    return { ok: true };
  },
};
