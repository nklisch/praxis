import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().describe("The draft ID to inspect."),
  draftUnitId: z.string().describe("The unit to list lessons for."),
});

const OutputSchema = z.object({
  draftUnitId: z.string(),
  unitName: z.string(),
  lessons: z.array(
    z.object({
      draftLessonId: z.string(),
      title: z.string(),
      conceptCount: z.number().int().nonnegative(),
      assessmentCount: z.number().int().nonnegative(),
    }),
  ),
});

export const listLessonsInUnitTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_lessons_in_unit",
  description:
    "List lessons within a specific draft unit, including title, concept count, and assessment count per lesson. Returns lesson list for a single unit without loading the full draft.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) throw new Error("draftId is required (pass as arg or open from a draft session)");

    const result = await ctx.services.bootstrap.listLessonsInUnit({
      draftId,
      draftUnitId: args.draftUnitId,
    });
    if (result === null) {
      throw new Error(
        `Draft or unit not found. draftId=${draftId} draftUnitId=${args.draftUnitId}`,
      );
    }

    return result;
  },
};
