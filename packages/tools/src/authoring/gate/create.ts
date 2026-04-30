import type { GateTarget, SuccessCriteria, ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  courseId: z.string().min(1).describe("The course this gate belongs to."),
  guards: z
    .object({
      kind: z.enum(["lesson", "concept"]).describe("What this gate guards access to."),
      lessonId: z.string().optional().describe("Lesson ID when kind is 'lesson'."),
      conceptId: z.string().optional().describe("Concept ID when kind is 'concept'."),
    })
    .describe("What this gate guards."),
  prerequisites: z
    .array(z.string().min(1))
    .describe("Gate IDs that must be unlocked before this gate can be evaluated."),
  successCriteria: z
    .unknown()
    .describe(
      "Success criteria object. Shape: {kind: 'mastery-threshold', conceptIds: [...], minScore: 0.8} or {kind: 'exam-pass', assignmentId: '...', minScore: 0.7}.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  gateId: z.string(),
  courseId: z.string(),
});

export const gateCreateTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "gate.create",
  description:
    "Create a new gate with initial locked state. Specify what it guards (lesson or concept), prerequisite gates, and success criteria. Writes are logged to the configurator audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const courseId = brandId<"CourseId">(args.courseId);
    const prerequisites = args.prerequisites.map((id) => brandId<"GateId">(id));
    const guards = args.guards as GateTarget;
    // biome-ignore lint/suspicious/noExplicitAny: SuccessCriteria is a complex union; Zod record shape passes through
    const successCriteria = args.successCriteria as any as SuccessCriteria;
    const result = await ctx.services.authoring.createGate({
      courseId,
      guards,
      prerequisites,
      successCriteria,
    });
    return { ok: true, gateId: result.id, courseId };
  },
};
