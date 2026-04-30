import type { GateTarget, SuccessCriteria, ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  gateId: z.string().min(1).describe("The gate ID to edit."),
  patch: z
    .object({
      prerequisites: z
        .array(z.string().min(1))
        .optional()
        .describe("Replace the full list of prerequisite gate IDs."),
      successCriteria: z
        .unknown()
        .optional()
        .describe(
          "Replace the success criteria. Shape: {kind: 'mastery-threshold', conceptIds: [...], minScore: 0.8}.",
        ),
    })
    .describe("Fields to update. Only provided fields are changed."),
  reason: z.string().optional().describe("Optional reason for the edit (logged to audit trail)."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  gateId: z.string(),
});

export const gateEditTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "gate.edit",
  description:
    "Update a gate's prerequisites or success criteria. Prefer editing over overriding — only use gate.override when you need to force-unlock a gate that a student is currently blocked by. Writes are logged.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const gateId = brandId<"GateId">(args.gateId);
    const patch: {
      prerequisites?: ReturnType<typeof brandId<"GateId">>[];
      successCriteria?: SuccessCriteria;
      guards?: GateTarget;
    } = {};
    if (args.patch.prerequisites !== undefined) {
      patch.prerequisites = args.patch.prerequisites.map((id) => brandId<"GateId">(id));
    }
    if (args.patch.successCriteria !== undefined) {
      // biome-ignore lint/suspicious/noExplicitAny: SuccessCriteria is a complex union; Zod record shape passes through
      patch.successCriteria = args.patch.successCriteria as any as SuccessCriteria;
    }
    await ctx.services.authoring.updateGate({
      gateId,
      patch,
      ...(args.reason !== undefined && { reason: args.reason }),
    });
    return { ok: true, gateId };
  },
};
