import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  lessonIndex: z.number().int().min(0).describe("Zero-based index of the lesson to remove."),
});

const OutputSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const draftRemoveLessonTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_remove_lesson",
  description:
    "Remove a lesson from the draft by its zero-based index. Subsequent lessons shift down.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) return { ok: false as const, reason: "no draftId in args or session context" };
    const result = await ctx.services.bootstrap.removeLesson({
      draftId,
      lessonIndex: args.lessonIndex,
    });
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, reason: result.reason ?? "unknown error" };
  },
};
