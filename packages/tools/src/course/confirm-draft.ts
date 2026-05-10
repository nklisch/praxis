import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().describe("The draft ID to validate and persist."),
});

const OutputSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    courseId: z.string(),
    lessonIds: z.array(z.string()),
    conceptGraphId: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    issues: z.array(z.object({ kind: z.string(), message: z.string() })),
  }),
]);

export const confirmDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.confirm_draft",
  description:
    "Validate and persist the draft as a real course. On success the course appears in the student's course list and is selectable for teach sessions; the draft is removed from the in-memory cache. On `ok:false` the draft remains live and `issues[]` describes what needs fixing — fix each via the draft_add_* tools (or course.discard_draft to abandon) and call confirm_draft again. The minimum bar is at least one concept and one lesson, and every reference must resolve.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const result = await ctx.services.bootstrap.confirmDraft({
      draftId: args.draftId,
      studentId: ctx.studentId,
    });
    if (result.ok) {
      return {
        ok: true,
        courseId: result.courseId,
        lessonIds: result.lessonIds,
        conceptGraphId: result.conceptGraphId,
      };
    }
    return {
      ok: false,
      issues: result.issues.map((i) => ({ kind: i.kind, message: i.message })),
    };
  },
};
