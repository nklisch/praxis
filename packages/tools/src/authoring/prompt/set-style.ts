import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  socratic: z
    .number()
    .min(-1)
    .max(1)
    .describe(
      "Teaching approach: -1 = pure Socratic (question-led discovery), +1 = pure lecture (explain-first). 0 = balanced.",
    ),
  verbosity: z
    .number()
    .min(-1)
    .max(1)
    .describe(
      "Response length: -1 = terse and concise, +1 = expansive and detailed. 0 = moderate.",
    ),
  formality: z
    .number()
    .min(-1)
    .max(1)
    .describe("Language register: -1 = formal academic, +1 = casual conversational. 0 = neutral."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  fragmentsWritten: z.number().describe("Number of prompt_overrides rows written."),
});

export const promptSetStyleTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "prompt.set_style",
  description:
    "Apply three style sliders (socratic, verbosity, formality) to compose and write teaching-style fragment overrides across instructional modes. Each value in [-1, +1]. Values in (-0.3, 0.3) produce balanced neutral text. One audit row is written for the batch.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    await ctx.services.authoring.setStyleSliders(args);
    // composeStyleOverrides produces 5 overrides (4 role.tutor + 1 productive-struggle).
    // Return the count for transparency.
    return { ok: true, fragmentsWritten: 5 };
  },
};
