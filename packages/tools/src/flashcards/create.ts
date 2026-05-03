import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  front: z.string().min(1).describe("The front (question/prompt) of the flashcard."),
  back: z.string().min(1).describe("The back (answer) of the flashcard."),
  conceptId: z
    .string()
    .optional()
    .describe(
      "Optional concept ID. Links the flashcard to the course's concept graph for cross-referenced display.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  flashcardId: z.string(),
});

export const createFlashcardTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "flashcard.create",
  description:
    "Create a flashcard with front + back text. Optional conceptId links to the course's concept graph for cross-referenced display in the progress map. Use when the student says 'make a flashcard for X'.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const card = await ctx.services.flashcards.create({
      studentId: ctx.studentId,
      front: args.front,
      back: args.back,
      ...(args.conceptId !== undefined && {
        conceptId: brandId<"ConceptId">(args.conceptId),
      }),
      source: { kind: "authored" },
    });
    return { ok: true, flashcardId: card.id };
  },
};
