/**
 * quick_check.matching — inline formative check, pair items between two columns.
 *
 * The student drags left-column items onto right-column items (or uses the
 * keyboard fallback). If correctPairs is provided, `correct` is true only
 * when every pair matches exactly.
 */
import type { MatchingItem, ToolDefinition } from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

const ColumnItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

const PairSchema = z.object({
  leftId: z.string().min(1),
  rightId: z.string().min(1),
});

const InputSchema = z.object({
  prompt: z.string().min(1).describe("Instructions shown above the matching activity."),
  left: z
    .array(ColumnItemSchema)
    .min(2)
    .describe("Items in the left column. Each must have a unique id and display text."),
  right: z
    .array(ColumnItemSchema)
    .min(2)
    .describe("Items in the right column. Each must have a unique id and display text."),
  correctPairs: z
    .array(PairSchema)
    .optional()
    .describe(
      "Optional. Expected (leftId, rightId) pairings. When set, `correct` is returned based on exact-set match of all pairs.",
    ),
});

const OutputSchema = z.object({
  pairs: z.array(PairSchema).describe("The student's submitted pairings."),
  correct: z.boolean().optional(),
});

/** Returns true iff both pair arrays represent the same set (order-independent). */
function pairSetsEqual(
  a: Array<{ leftId: string; rightId: string }>,
  b: Array<{ leftId: string; rightId: string }>,
): boolean {
  if (a.length !== b.length) return false;
  const bKeys = new Set(b.map((p) => `${p.leftId}|${p.rightId}`));
  return a.every((p) => bKeys.has(`${p.leftId}|${p.rightId}`));
}

export const quickCheckMatchingTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "quick_check.matching",
  description:
    "Ask the student to pair items between two columns inline in chat. Renders a drag-and-drop card (keyboard fallback available); blocks until the student submits. Use to probe relational knowledge — e.g. match vocabulary to definitions, formulas to names, causes to effects. Set correctPairs for grader feedback; omit for a pure formative probe. Abandoned → pairs: [].",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: [],
  async handler(args, ctx) {
    const callId = uuidv7();
    const item: MatchingItem = {
      kind: "matching",
      id: callId,
      prompt: args.prompt,
      leftItems: args.left,
      rightItems: args.right,
      correctPairs: args.correctPairs ?? [],
    };

    const answer = await ctx.services.quickCheck?.await({
      callId,
      sessionId: ctx.sessionId,
      item,
    });

    if (!answer || answer.kind === "abandoned") {
      return { pairs: [] };
    }

    if (answer.kind !== "matching") {
      throw new Error(`unexpected answer kind: ${answer.kind}`);
    }

    return {
      pairs: answer.pairs,
      ...(args.correctPairs !== undefined && {
        correct: pairSetsEqual(answer.pairs, args.correctPairs),
      }),
    };
  },
};
