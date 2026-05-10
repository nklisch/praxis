/**
 * quick_check.confidence — inline self-assessment of confidence.
 *
 * Implementation note: confidence reuses SingleChoiceItem with rating labels
 * as the options. This keeps v1 simple — QuickCheckCard renders it as a
 * single-choice, the student picks a rating, and we return the numeric rating.
 * A dedicated confidence item kind can be introduced in a later phase if the
 * UI needs distinct treatment (e.g. slider instead of radio buttons).
 */
import type { SingleChoiceItem, ToolDefinition } from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

const RATING_LABELS: Record<"1-4" | "1-5", string[]> = {
  "1-4": ["1 — guessing", "2 — unsure", "3 — confident", "4 — sure"],
  "1-5": ["1 — guessing", "2 — unsure", "3 — somewhat sure", "4 — confident", "5 — certain"],
};

const InputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .default("How confident are you in your answer?")
    .describe("The self-assessment prompt shown to the student."),
  scale: z
    .enum(["1-4", "1-5"])
    .default("1-4")
    .describe(
      'Rating scale. "1-4" is the default four-point scale; "1-5" adds a fifth "certain" anchor.',
    ),
});

const OutputSchema = z.object({
  rating: z
    .number()
    .int()
    .describe(
      "The student's self-assessed rating (1 = lowest confidence). 0 if the check was abandoned.",
    ),
});

export const quickCheckConfidenceTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "quick_check.confidence",
  description:
    "Ask the student to self-assess their confidence on a rating scale inline in chat. Use after a worked example, after the student attempts a problem, or before revealing the answer to a question you just posed. Pairs well with other quick_check tools: pose a single_choice first, then follow with a confidence check to surface overconfidence. Returns a numeric rating (1 = lowest). Abandoned → rating: 0.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: [],
  async handler(args, ctx) {
    const callId = uuidv7();
    const options = RATING_LABELS[args.scale];

    // Confidence reuses SingleChoiceItem with rating labels as options (v1).
    // The QuickCheckCard renders it as a standard single-choice; future phases
    // can introduce a dedicated confidence kind with a slider UI if needed.
    const item: SingleChoiceItem = {
      kind: "single-choice",
      id: callId,
      prompt: args.prompt,
      options,
      // -1 sentinel: no "correct" option — confidence is self-reported, not graded.
      correctOptionIndex: -1,
    };

    const answer = await ctx.services.quickCheck?.await({
      callId,
      sessionId: ctx.sessionId,
      item,
    });

    if (!answer || answer.kind === "abandoned") {
      return { rating: 0 };
    }

    if (answer.kind !== "single-choice") {
      throw new Error(`unexpected answer kind: ${answer.kind}`);
    }

    // Convert 0-based index to 1-based rating.
    return { rating: answer.selectedIndex + 1 };
  },
};
