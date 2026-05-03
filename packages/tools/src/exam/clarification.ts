/**
 * Phase 16: clarification tool — the only permitted tool in exam mode.
 *
 * Returns a normalized rephrasing of the question prompt so the student can
 * ask "what does this question mean?" without receiving help or partial answers.
 * The model's wrapper turn around this tool call generates the actual
 * rephrasing; the tool itself is a passthrough that records the request for
 * auditability in the episodic transcript.
 */
import type { ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  studentQuestion: z
    .string()
    .min(1)
    .describe(
      "The student's question about the prompt — e.g. 'What does this question mean?' or 'Can you rephrase item 3?'.",
    ),
  itemId: z.string().optional().describe("The item id the student is asking about, if known."),
});

const OutputSchema = z.object({
  kind: z.literal("rephrased"),
  text: z.string().describe("Echo of the student's question for the model to rephrase."),
  itemId: z.string().optional(),
});

/**
 * The clarification tool.
 *
 * Design notes:
 * - Exam mode permits ONLY this tool (plus assignment.show / assignment.read_grade).
 *   Its presence in exam mode allows the student to request a plain-English
 *   restatement of a confusing question. The model never reveals method or
 *   partial answer — only rephrases the prompt.
 * - The tool is intentionally a passthrough: it returns the question as-is so
 *   the model can compose the rephrasing in its surrounding narrative turn.
 * - Auditability: the tool_call event in the episodic transcript records that
 *   the student requested clarification for item X at time T — useful for
 *   post-exam review and future misconception indexing.
 */
export const clarificationTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "clarification",
  description: `Rephrase a confusing exam question in plain language. Use ONLY when the student explicitly asks what a question means or asks for a restatement. Do NOT reveal method, steps, or any partial answer. Return kind: "rephrased" and let your surrounding narrative turn provide the plain-language version.`,
  tier: "deterministic",
  effects: ["none"],
  input: InputSchema,
  output: OutputSchema,
  async handler(input) {
    return {
      kind: "rephrased" as const,
      text: input.studentQuestion,
      ...(input.itemId !== undefined && { itemId: input.itemId }),
    };
  },
};
