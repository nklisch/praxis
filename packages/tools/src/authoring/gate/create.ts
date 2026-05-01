import type { GateTarget, SuccessCriteria, ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { GateTargetSchema, SuccessCriteriaSchema } from "./schema.js";

const InputSchema = z.object({
  courseId: z.string().min(1).describe("The course this gate belongs to."),
  guards: GateTargetSchema.describe(
    "What this gate guards (concept, lesson, topic, or course-completion).",
  ),
  prerequisites: z
    .array(z.string().min(1))
    .describe("Gate IDs that must be unlocked before this gate can be evaluated."),
  successCriteria: SuccessCriteriaSchema.describe("Success criteria object."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  gateId: z.string(),
  courseId: z.string(),
});

export const gateCreateTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "gate.create",
  description:
    "Create a new gate with initial locked state. Specify what it guards (lesson, concept, topic, or course-completion), prerequisite gates, and success criteria. Writes are logged to the configurator audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const courseId = brandId<"CourseId">(args.courseId);
    const prerequisites = args.prerequisites.map((id) => brandId<"GateId">(id));
    // args.guards and args.successCriteria are structurally validated by Zod.
    // The brand casts are required because Zod produces plain string IDs, not
    // branded ones — this is a one-shot cast at the schema/domain boundary,
    // not a validation bypass. The structure is already guaranteed by the schema.
    const result = await ctx.services.authoring.createGate({
      courseId,
      guards: args.guards as GateTarget,
      prerequisites,
      successCriteria: args.successCriteria as SuccessCriteria,
    });
    return { ok: true, gateId: result.id, courseId };
  },
};
