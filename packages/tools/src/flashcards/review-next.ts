import type { FsrsState, Timestamp, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  count: z
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe("Number of due cards to fetch (default 1, max 20)."),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    cards: z.array(
      z.object({
        flashcardId: z.string(),
        front: z.string(),
        conceptId: z.string().nullable(),
        preview: z.object({
          again: z.number(),
          hard: z.number(),
          good: z.number(),
          easy: z.number(),
        }),
      }),
    ),
  }),
  z.object({ kind: z.literal("none_due") }),
]);

export const reviewNextTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "flashcard.review_next",
  description:
    "Fetch the next due flashcards for inline review. Returns front + conceptId + preview of all four next-review-dates (so the UI can label rating buttons). Defaults to 1 card; cap 20 per call. Use during chat for 'warm up before today's lesson' or 'quick review break'.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const cards = await ctx.services.flashcards.list({
      studentId: ctx.studentId,
      due: true,
      limit: args.count ?? 1,
    });

    if (cards.length === 0) return { kind: "none_due" as const };

    const now = Date.now() as Timestamp;

    const out = cards.map((c) => {
      // Reconstruct FsrsState for the preview call.
      // biome-ignore lint/suspicious/noExplicitAny: reviewState is opaque JSON from DB
      const rs = c.reviewState as any;
      const fsrsState: FsrsState = {
        state: rs.state as Record<string, unknown>,
        reps: (rs.reps as number | undefined) ?? 0,
        lapses: (rs.lapses as number | undefined) ?? 0,
        ...(rs.nextReviewAt !== undefined && { nextReviewAt: rs.nextReviewAt as Timestamp }),
        ...(rs.lastReviewedAt !== undefined && { lastReviewedAt: rs.lastReviewedAt as Timestamp }),
      };
      const preview = ctx.services.fsrsScheduler.preview({ state: fsrsState, now });
      return {
        flashcardId: c.id,
        front: c.front,
        conceptId: c.conceptId ?? null,
        preview: {
          again: preview.again.nextReviewAt,
          hard: preview.hard.nextReviewAt,
          good: preview.good.nextReviewAt,
          easy: preview.easy.nextReviewAt,
        },
      };
    });

    return { kind: "ok" as const, cards: out };
  },
};
