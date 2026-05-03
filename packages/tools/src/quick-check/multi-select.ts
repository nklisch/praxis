/**
 * quick_check.multi_select — inline formative check, multiple correct options.
 *
 * Like single_choice but the student can pick any number of options. If
 * correctIndices is provided, `correct` is true only when the selected set
 * exactly matches (order-independent). Partial credit is not returned here —
 * the model reads selectedIndices and reacts qualitatively.
 */
import type { MultiSelectItem, ToolDefinition } from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

const InputSchema = z.object({
  prompt: z.string().min(1).describe("The question to ask the student."),
  options: z.array(z.string().min(1)).min(2).describe("Answer choices, in display order."),
  correctIndices: z
    .array(z.number().int().nonnegative())
    .optional()
    .describe(
      "Optional. Sorted ascending indices of all correct options. When set, `correct` is returned based on exact-set match.",
    ),
});

const OutputSchema = z.object({
  selectedIndices: z.array(z.number().int()),
  correct: z.boolean().optional(),
});

/** Returns true iff both arrays contain exactly the same integers (order-independent). */
function setsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((v) => bSet.has(v));
}

export const quickCheckMultiSelectTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "quick_check.multi_select",
  description:
    'Ask the student to select all correct options from a list (multi-select). Renders an inline card; blocks until the student submits. Use when more than one answer can be correct — e.g. "which of these are properties of X?". Set correctIndices for grader feedback; omit for a pure formative probe. Abandoned → selectedIndices: [].',
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: [],
  async handler(args, ctx) {
    const callId = uuidv7();
    const item: MultiSelectItem = {
      kind: "multi-select",
      id: callId,
      prompt: args.prompt,
      options: args.options,
      // When no answer key provided, use empty array as placeholder.
      correctOptionIndices: args.correctIndices ?? [],
    };

    const answer = await ctx.services.quickCheck?.await({
      callId,
      sessionId: ctx.sessionId,
      item,
    });

    if (!answer || answer.kind === "abandoned") {
      return { selectedIndices: [] };
    }

    if (answer.kind !== "multi-select") {
      throw new Error(`unexpected answer kind: ${answer.kind}`);
    }

    return {
      selectedIndices: answer.selectedIndices,
      ...(args.correctIndices !== undefined && {
        correct: setsEqual(answer.selectedIndices, args.correctIndices),
      }),
    };
  },
};
