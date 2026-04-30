import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  conceptId: z.string().min(1).describe("The concept ID to reset."),
  reason: z
    .string()
    .min(1)
    .describe(
      "Required reason for the reset — logged to the audit trail. Example: 'Student requested fresh start on fractions'.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  conceptId: z.string(),
});

export const resetConceptTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "memory.reset_concept",
  description:
    "Reset a concept to initial BKT state ('as if never observed'). Sets pKnown to the prior, clears evidence and lastPracticedAt. Use when the configurator wants the student to relearn a concept from scratch. Reason required; logged to configurator audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["memory.write"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const conceptId = brandId<"ConceptId">(args.conceptId);
    await ctx.services.authoring.resetConcept({
      studentId: ctx.studentId,
      conceptId,
      reason: args.reason,
    });
    return { ok: true, conceptId };
  },
};
