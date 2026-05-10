/**
 * ask_student_question — inline structured-choice prompt for bootstrap and configure modes.
 *
 * Renders an interactive card in the chat thread with one to four questions,
 * each having a short header chip, a full prompt, and 2-8 labeled options.
 * Blocks until the student submits or abandons.
 *
 * Not for assessment — the model receives the answer and acts on it. Use
 * quick_check.* tools for formative checks that inform the tutor's understanding
 * of the student's knowledge.
 */
import type { StructuredQuestionItem, ToolDefinition } from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

const InputSchema = z.object({
  questions: z
    .array(
      z.object({
        header: z
          .string()
          .min(1)
          .max(40)
          .describe(
            "Very short label (max ~12 chars recommended) shown as a chip on the card. " +
              "Examples: 'Auth method', 'Library', 'Approach'.",
          ),
        prompt: z.string().min(1).describe("The full question shown above the options."),
        multiSelect: z
          .boolean()
          .default(false)
          .describe("When true, student can pick more than one option."),
        options: z
          .array(
            z.object({
              label: z.string().min(1).describe("The display text the student sees and selects."),
              description: z
                .string()
                .optional()
                .describe("Explanation of what this option means or its trade-off."),
            }),
          )
          .min(2)
          .max(8),
      }),
    )
    .min(1)
    .max(4)
    .describe("One to four structured questions, rendered as a stack on a single card."),
});

const OutputSchema = z.object({
  answers: z.array(
    z.object({
      questionIndex: z.number().int().nonnegative(),
      selectedIndices: z.array(z.number().int().nonnegative()),
    }),
  ),
  abandoned: z.boolean().optional(),
});

export const askStudentQuestionTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "ask_student_question",
  description:
    "Ask the student one or more structured choice questions inline in the chat. Renders an interactive card with chip-labeled questions and labeled options; blocks until the student submits. Use when you need a decision the student must make for you to proceed — e.g. 'use the canonical pack, the textbook, or both?', 'merge these lessons or keep them separate?'. Do NOT use for assessment (use quick_check.* for formative checks). Do NOT use to pad turns with rhetorical questions. Each question has a short `header` chip, a `prompt`, a `multiSelect` flag, and 2-8 `options`. Up to 4 questions per call. If the student abandons the card, the tool returns `{ answers: [], abandoned: true }`.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: [],
  async handler(args, ctx) {
    const callId = uuidv7();
    const item: StructuredQuestionItem = {
      kind: "structured-question",
      id: callId,
      questions: args.questions.map((q) => ({
        header: q.header,
        prompt: q.prompt,
        multiSelect: q.multiSelect,
        // exactOptionalPropertyTypes: only include description when present
        options: q.options.map((o) =>
          o.description !== undefined
            ? { label: o.label, description: o.description }
            : { label: o.label },
        ),
      })),
    };

    const answer = await ctx.services.quickCheck?.await({
      callId,
      sessionId: ctx.sessionId,
      item,
    });

    if (!answer || answer.kind === "abandoned") {
      return { answers: [], abandoned: true };
    }

    if (answer.kind !== "structured-question") {
      throw new Error(`unexpected answer kind: ${answer.kind}`);
    }

    return { answers: answer.answers };
  },
};
