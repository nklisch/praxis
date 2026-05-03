import type { Reference, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  title: z.string().min(1).describe("Lesson title."),
  conceptNames: z
    .array(z.string())
    .min(1)
    .describe("Concepts covered by this lesson. Every name must already exist in the draft."),
  references: z
    .array(
      z.object({
        kind: z.enum(["textbook", "url", "video", "note"]),
        source: z.string(),
        locator: z
          .object({ page: z.number().int().optional(), section: z.string().optional() })
          .optional(),
      }),
    )
    .default([])
    .describe("Source references for the lesson."),
  suggestedStrategy: z
    .string()
    .optional()
    .describe("Teaching strategy id, e.g. 'worked-examples'. Defaults to 'worked-examples'."),
  estimatedMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Estimated teaching time in minutes. Defaults to 45."),
});

const OutputSchema = z.union([
  z.object({ ok: z.literal(true), lessonIndex: z.number().int() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const draftAddLessonTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_add_lesson",
  description:
    "Add one lesson to the draft. Every concept in `conceptNames` must already exist in the draft. Lessons are appended in call order.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) return { ok: false as const, reason: "no draftId in args or session context" };
    return ctx.services.bootstrap.addLesson({
      draftId,
      title: args.title,
      conceptNames: args.conceptNames,
      references: args.references as Reference[],
      ...(args.suggestedStrategy !== undefined && {
        // biome-ignore lint/suspicious/noExplicitAny: StrategyId brand applied via cast
        suggestedStrategy: args.suggestedStrategy as any,
      }),
      ...(args.estimatedMinutes !== undefined && { estimatedMinutes: args.estimatedMinutes }),
    });
  },
};
