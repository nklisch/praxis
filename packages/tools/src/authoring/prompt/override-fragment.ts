import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  modeId: z
    .string()
    .min(1)
    .describe(
      "Mode ID to override for (e.g. 'teach', 'quiz', 'configure'). Use 'teach' for the main tutoring mode.",
    ),
  fragmentId: z
    .string()
    .min(1)
    .describe(
      "Fragment ID to override (e.g. 'role.tutor', 'constraints.productive-struggle'). Must be customizable: true.",
    ),
  override: z
    .string()
    .min(1)
    .describe(
      "New fragment text. Replaces the default template for this (modeId, fragmentId) pair.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  modeId: z.string(),
  fragmentId: z.string(),
});

export const promptOverrideFragmentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "prompt.override_fragment",
  description:
    "Set a custom override for a specific (modeId, fragmentId) pair in the prompt. Overwrites the default fragment text for this installation. Only fragments with customizable: true can be overridden. Logged to audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    await ctx.services.authoring.customizePrompt(args.modeId, args.fragmentId, args.override);
    return { ok: true, modeId: args.modeId, fragmentId: args.fragmentId };
  },
};
