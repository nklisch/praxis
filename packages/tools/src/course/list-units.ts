import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().describe("The draft ID to inspect."),
});

const OutputSchema = z.object({
  units: z.array(
    z.object({
      draftUnitId: z.string(),
      name: z.string(),
      summary: z.string().optional(),
      lessonCount: z.number().int().nonnegative(),
      hasSummative: z.boolean(),
    }),
  ),
});

export const listUnitsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_units",
  description:
    "List all proposed units in a draft with lesson counts and whether each has a summative assessment. Use this to get a quick overview of the draft's unit structure without loading the full draft.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) throw new Error("draftId is required (pass as arg or open from a draft session)");

    const units = await ctx.services.bootstrap.listUnits(draftId);
    if (units === null) throw new Error(`Draft not found or expired: ${draftId}`);

    return { units };
  },
};
