import { brandId } from "@praxis/core/types";
import type { Rating, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  flashcardId: z.string().describe("The ID of the flashcard being reviewed."),
  rating: z
    .enum(["again", "hard", "good", "easy"])
    .describe(
      "The review rating: again (failed), hard (difficult), good (correct), easy (effortless).",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  flashcardId: z.string(),
  nextReviewAt: z.number().describe("Unix timestamp (ms) of the next scheduled review."),
  reps: z.number().int().describe("Total number of reviews recorded for this card."),
});

export const reviewFlashcardTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "flashcard.review",
  description:
    "Record a review rating for a flashcard. The FSRS scheduler computes the next review date. Use this after the student has rated a card during inline review or the dedicated review session.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: ["memory.write"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const result = await ctx.services.flashcards.review({
      studentId: ctx.studentId,
      flashcardId: brandId<"FlashcardId">(args.flashcardId),
      rating: args.rating as Rating,
    });
    const reps = (result.flashcard.reviewState as { reps?: number }).reps ?? 0;
    return {
      ok: true,
      flashcardId: result.flashcard.id,
      nextReviewAt: result.nextReviewAt,
      reps,
    };
  },
};
