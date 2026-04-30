import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  gateId: z.string().min(1).describe("The gate ID to delete."),
  reason: z
    .string()
    .min(1)
    .describe(
      "Required reason for deletion — logged to the audit trail. Example: 'Gate was accidentally duplicated'.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  gateId: z.string(),
});

export const gateDeleteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "gate.delete",
  description:
    "Delete a gate. gate_unlock_events rows cascade via FK. DESTRUCTIVE — always confirm with the configurator before calling. Reason is required and logged.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const gateId = brandId<"GateId">(args.gateId);
    await ctx.services.authoring.deleteGate({ gateId, reason: args.reason });
    return { ok: true, gateId };
  },
};
