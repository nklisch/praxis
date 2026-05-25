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
 *
 * IMPORTANT: The card always provides two escape hatches the model must NOT
 * duplicate as structured choices:
 *   1. A free-form text field so the student can give a real response when no
 *      choice fits.
 *   2. A "clarify in chat" cancel control that dismisses the card and tells the
 *      agent to resume conversational mode.
 * Do NOT add choices like "tell me in chat", "explain in chat", "ask in chat",
 * or similar — those paths are already provided by the UI controls.
 */
import type {
  QuestionConstraints,
  StructuredQuestionItem,
  ToolDefinition,
} from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { validateQuestionConstraints } from "./validate-question-constraints.js";

/**
 * Patterns forbidden in choice label text. The card already provides a
 * "clarify in chat" cancel control and a free-form text field — adding choices
 * that offer those same paths clutters the option list and gives the model a
 * wrong-shaped affordance.
 */
const FORBIDDEN_CHOICE_PATTERNS = [
  /\btell me in chat\b/i,
  /\bexplain in chat\b/i,
  /\bask in chat\b/i,
  /\bdiscuss in chat\b/i,
  /\bchat about\b/i,
  /\bin the chat\b/i,
  /\bclarify in chat\b/i,
];

/**
 * Inline fallback constraints used when ctx.questionConstraints is absent.
 * These values mirror FALLBACK_QUESTION_CONSTRAINTS in @praxis/curriculum, which
 * @praxis/tools cannot import at runtime per the dependency direction rules.
 * If the curriculum fallback values change, update this constant too.
 */
const INLINE_FALLBACK_CONSTRAINTS: Required<QuestionConstraints> = {
  promptMaxWords: 60,
  choiceMaxWords: 25,
  choiceCount: 5,
  multiSelectCap: 6,
};

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
          .max(8)
          .refine(
            (opts) => opts.every((o) => !FORBIDDEN_CHOICE_PATTERNS.some((re) => re.test(o.label))),
            {
              message:
                "Choice text must not suggest 'discuss in chat', 'tell me in chat', 'explain in chat', or similar — use the 'clarify in chat' cancel control instead (it is already part of the card UI).",
            },
          ),
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
    "Ask the student one or more structured choice questions inline in the chat. Renders an interactive card with chip-labeled questions and labeled options; blocks until the student submits. Use when you need a decision the student must make for you to proceed — e.g. 'use the canonical pack, the textbook, or both?', 'merge these lessons or keep them separate?'. Do NOT use for assessment (use quick_check.* for formative checks). Do NOT use to pad turns with rhetorical questions. Each question has a short `header` chip, a `prompt`, a `multiSelect` flag, and 2-8 `options`. Up to 4 questions per call. If the student abandons the card, the tool returns `{ answers: [], abandoned: true }`. IMPORTANT: the card already provides two escape hatches — a free-form text field and a 'clarify in chat' cancel button. Do NOT add choices like 'tell me in chat', 'explain in chat', 'ask in chat', 'discuss in chat', or similar; the schema will reject them. Use concrete, substantive choices only.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: [],
  async handler(args, ctx) {
    // Validate all questions upfront before any side effect. Short-circuits on
    // first failure — no partial enqueue possible.
    const constraints = ctx.questionConstraints ?? INLINE_FALLBACK_CONSTRAINTS;
    const modeLabel = ctx.modeId ?? "current";
    for (const q of args.questions) {
      const result = validateQuestionConstraints(q, constraints, modeLabel);
      if (!result.ok) {
        throw new Error(result.message);
      }
    }

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
