/**
 * quick_check.short_answer — inline formative check, free-text answer.
 *
 * Formative only by design: no answer key is accepted. The tutor reads the
 * student's text and reacts qualitatively. The student's response is captured
 * in the tool result so the model can reference it directly.
 */
import type { QuestionConstraints, ShortAnswerItem, ToolDefinition } from "@praxis/core/types";
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
  prompt: z.string().min(1).describe("The question or prompt to show the student."),
});

const OutputSchema = z.object({
  text: z.string().describe("The student's typed answer. Empty string if abandoned."),
});

export const quickCheckShortAnswerTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "quick_check.short_answer",
  description:
    'Ask the student to type a short free-text answer inline. Renders a text input card; blocks until the student submits. Formative only — no answer key. You read the text and react qualitatively in your next turn. Use when you want the student\'s own words: "explain why…", "what would you try next?". Abandoned → text: "".',
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: [],
  async handler(args, ctx) {
    // short-answer has no choice options; validate prompt only (empty options array
    // means choiceCount and choiceMaxWords checks are vacuously satisfied).
    const constraints = ctx.questionConstraints ?? INLINE_FALLBACK_CONSTRAINTS;
    const modeLabel = ctx.modeId ?? "current";
    const validation = validateQuestionConstraints(
      { prompt: args.prompt, options: [] },
      constraints,
      modeLabel,
    );
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const callId = uuidv7();
    const item: ShortAnswerItem = {
      kind: "short-answer",
      id: callId,
      prompt: args.prompt,
      // No accepted answers — this is a formative probe; the model reads and reacts.
      acceptedAnswers: [],
    };

    const answer = await ctx.services.quickCheck?.await({
      callId,
      sessionId: ctx.sessionId,
      item,
    });

    if (!answer || answer.kind === "abandoned") {
      return { text: "" };
    }

    if (answer.kind !== "short-answer") {
      throw new Error(`unexpected answer kind: ${answer.kind}`);
    }

    return { text: answer.text };
  },
};
