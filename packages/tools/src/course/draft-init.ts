import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  courseTitle: z.string().min(1).describe("The desired course title."),
  subject: z.string().min(1).describe("Subject slug, e.g. 'math.algebra-1'."),
  gradeLevel: z.string().min(1).describe("Grade level, e.g. '9-12'."),
  documentIds: z.array(z.string()).min(1).describe("Document IDs to build the course from."),
});

const OutputSchema = z.object({
  draftId: z.string(),
});

export const draftInitTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_init",
  description:
    "Create an empty course draft. Call this ONCE at the start of exploration, before adding any concepts. The returned `draftId` is injected into the session context automatically — subsequent draft_* calls do not need to supply it explicitly.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const result = await ctx.services.bootstrap.initDraft({
      studentId: ctx.studentId,
      documentIds: args.documentIds.map((id) => brandId<"DocumentId">(id)),
      courseTitle: args.courseTitle,
      subject: args.subject,
      gradeLevel: args.gradeLevel,
    });
    return result;
  },
};
