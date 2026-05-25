/**
 * quick_check.single_choice — inline formative check, single correct option.
 *
 * The handler generates a callId (uuidv7), builds a SingleChoiceItem, and
 * blocks on QuickCheckService.await() until the student answers or the call
 * is abandoned. The model sees only the output shape; the callId is an
 * internal server-side key.
 */
import type { QuestionConstraints, SingleChoiceItem, ToolDefinition } from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { validateQuestionConstraints } from "../dialog/validate-question-constraints.js";

/**
 * Inline fallback constraints used when ctx.questionConstraints is absent.
 * Mirrors FALLBACK_QUESTION_CONSTRAINTS in @praxis/curriculum, which
 * @praxis/tools cannot import at runtime per the dependency direction rules.
 */
const INLINE_FALLBACK_CONSTRAINTS: Required<QuestionConstraints> = {
  promptMaxWords: 60,
  choiceMaxWords: 25,
  choiceCount: 5,
  multiSelectCap: 6,
};

const InputSchema = z.object({
  prompt: z.string().min(1).describe("The question to ask the student."),
  options: z.array(z.string().min(1)).min(2).describe("Answer choices, in display order."),
  correctIndex: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Optional. When set, the student's selection is graded and `correct` is returned. Omit for a pure formative probe.",
    ),
});

const OutputSchema = z.object({
  selectedIndex: z.number().int(),
  correct: z.boolean().optional(),
});

export const quickCheckSingleChoiceTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "quick_check.single_choice",
  description:
    "Ask the student a single-choice question inline in the current conversation. Renders an interactive card; blocks until the student answers. Use for formative checks-for-understanding mid-explanation, after a worked example, or before introducing a new concept. For graded work that warrants its own tab, use assignment.create instead. Set correctIndex when you want grader feedback on the selection; omit it for open-ended probes where you'll react qualitatively. Abandoned answers (student closed tab) return selectedIndex: -1.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: [],
  async handler(args, ctx) {
    const constraints = ctx.questionConstraints ?? INLINE_FALLBACK_CONSTRAINTS;
    const modeLabel = ctx.modeId ?? "current";
    const validation = validateQuestionConstraints(
      { prompt: args.prompt, options: args.options },
      constraints,
      modeLabel,
    );
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const callId = uuidv7();
    const item: SingleChoiceItem = {
      kind: "single-choice",
      id: callId,
      prompt: args.prompt,
      options: args.options,
      correctOptionIndex: args.correctIndex ?? -1,
    };

    const answer = await ctx.services.quickCheck?.await({
      callId,
      sessionId: ctx.sessionId,
      item,
    });

    if (!answer || answer.kind === "abandoned") {
      return { selectedIndex: -1 };
    }

    if (answer.kind !== "single-choice") {
      throw new Error(`unexpected answer kind: ${answer.kind}`);
    }

    return {
      selectedIndex: answer.selectedIndex,
      ...(args.correctIndex !== undefined && {
        correct: answer.selectedIndex === args.correctIndex,
      }),
    };
  },
};
