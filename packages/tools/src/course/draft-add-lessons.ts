import type { Reference, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const ReferenceSchema = z.object({
  kind: z.enum(["textbook", "url", "video", "note"]),
  source: z.string(),
  locator: z
    .object({ page: z.number().int().optional(), section: z.string().optional() })
    .optional(),
});

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  lessons: z
    .array(
      z.object({
        title: z.string().min(1).describe("Lesson title."),
        conceptNames: z
          .array(z.string())
          .min(1)
          .describe("Concepts covered. Every name must already exist in the draft."),
        references: z.array(ReferenceSchema).default([]).describe("Source references."),
        suggestedStrategy: z
          .string()
          .optional()
          .describe(
            "Teaching strategy id (e.g. 'worked-examples'). Defaults to 'worked-examples'.",
          ),
        estimatedMinutes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Estimated teaching time in minutes. Defaults to 45."),
      }),
    )
    .min(1)
    .describe("Lessons to add, in declared order. Lesson order on the draft mirrors call order."),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  /** Total lesson count on the draft after the batch. */
  lessonCount: z.number().int(),
  results: z.array(
    z.union([
      z.object({ ok: z.literal(true), title: z.string(), lessonIndex: z.number().int() }),
      z.object({ ok: z.literal(false), title: z.string(), reason: z.string() }),
    ]),
  ),
});

export const draftAddLessonsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_add_lessons",
  description:
    "Add many lessons to the draft in one tool call. Each lesson's conceptNames must already exist. Lessons are appended in declared order; order is preserved across the batch. Costs one step regardless of array length. Per-lesson failures are reported in `results` without aborting subsequent lessons.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) {
      return {
        ok: false,
        lessonCount: 0,
        results: args.lessons.map((l) => ({
          ok: false as const,
          title: l.title,
          reason: "no draftId in args or session context",
        })),
      };
    }
    const results: Array<
      | { ok: true; title: string; lessonIndex: number }
      | { ok: false; title: string; reason: string }
    > = [];
    let lessonCount = 0;
    let allOk = true;
    for (const l of args.lessons) {
      const r = await ctx.services.bootstrap.addLesson({
        draftId,
        title: l.title,
        conceptNames: l.conceptNames,
        references: l.references as Reference[],
        ...(l.suggestedStrategy !== undefined && {
          // biome-ignore lint/suspicious/noExplicitAny: StrategyId brand applied via cast (mirrors single-add tool)
          suggestedStrategy: l.suggestedStrategy as any,
        }),
        ...(l.estimatedMinutes !== undefined && { estimatedMinutes: l.estimatedMinutes }),
      });
      if (r.ok) {
        lessonCount = r.lessonIndex + 1;
        results.push({ ok: true, title: l.title, lessonIndex: r.lessonIndex });
      } else {
        allOk = false;
        results.push({ ok: false, title: l.title, reason: r.reason });
      }
    }
    return { ok: allOk, lessonCount, results };
  },
};
