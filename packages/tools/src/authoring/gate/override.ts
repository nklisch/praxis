import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  gateId: z.string().min(1).describe("The gate ID to force-unlock."),
  reason: z
    .string()
    .min(1)
    .describe(
      "Required reason for the override — logged to the audit trail. Example: 'Student completed equivalent work outside the system'.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  gateId: z.string(),
  state: z.literal("overridden"),
});

export const gateOverrideTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "gate.override",
  description:
    "Force a gate to 'overridden' state, unlocking it immediately regardless of success criteria. Use sparingly — prefer gate.edit to fix criteria. Use override when a student is blocked and needs to proceed now. Reason required; logged to audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate", "gate.evaluate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const gateId = brandId<"GateId">(args.gateId);
    await ctx.services.authoring.overrideGate({ gateId, reason: args.reason });
    return { ok: true, gateId, state: "overridden" };
  },
};
