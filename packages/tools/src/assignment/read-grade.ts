import type { ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  assignmentId: z
    .string()
    .optional()
    .describe(
      "The assignment to read the grade for. Defaults to the session's bound assignmentId when omitted.",
    ),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("graded"),
    // biome-ignore lint/suspicious/noExplicitAny: Grade — full object for agent narration
    grade: z.unknown() as z.ZodType<any>,
    submittedAt: z.number(),
  }),
  z.object({ kind: z.literal("not_yet_submitted") }),
  z.object({ kind: z.literal("not_found") }),
]);

export const readGradeTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "assignment.read_grade",
  description:
    "Fetch the grade for an assignment. Use this AFTER submission to narrate per-item feedback in the chat. Each item's feedback explains what was right/wrong; the gradedBy field tells you whether the grade came from a deterministic grader (definitive) or the rubric agent (advisory).",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) {
    const id = args.assignmentId ?? ctx.assignmentId;
    if (!id) return { kind: "not_found" as const };
    const assignment = await ctx.services.assignments.get({
      assignmentId: brandId<"AssignmentId">(id),
    });
    if (!assignment) return { kind: "not_found" as const };
    if (!assignment.submittedAt || !assignment.grade) return { kind: "not_yet_submitted" as const };
    return {
      kind: "graded" as const,
      grade: assignment.grade,
      submittedAt: assignment.submittedAt,
    };
  },
};
