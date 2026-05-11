import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().describe("The draft ID to inspect."),
});

const OutputSchema = z.object({
  orphanConcepts: z.array(z.string()),
  danglingUnitMemberships: z.array(
    z.object({
      draftUnitId: z.string(),
      unitName: z.string(),
      badLessonIds: z.array(z.string()),
    }),
  ),
  danglingLessonAssessments: z.array(
    z.object({
      draftAssessmentId: z.string(),
      badLessonId: z.string(),
    }),
  ),
  edgesReferencingUnknownConcepts: z.array(
    z.object({
      fromName: z.string(),
      toName: z.string(),
    }),
  ),
});

export const listDanglingRefsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_dangling_refs",
  description:
    "Inspect the referential integrity of a draft: finds orphan concepts (in graph but not in any lesson), dangling unit memberships (unit references a removed lesson id), dangling lesson assessments (assessment references a removed lesson), and edges referencing unknown concepts. Use before course.confirm_draft to verify integrity.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) throw new Error("draftId is required (pass as arg or open from a draft session)");

    const result = await ctx.services.bootstrap.listDanglingRefs(draftId);
    if (result === null) throw new Error(`Draft not found or expired: ${draftId}`);

    return result;
  },
};
