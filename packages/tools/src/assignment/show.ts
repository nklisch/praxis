import type { ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  assignmentId: z
    .string()
    .optional()
    .describe("The assignment to show. Defaults to the session's bound assignmentId when omitted."),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    // biome-ignore lint/suspicious/noExplicitAny: Assignment full object — UI renders via card dispatch
    assignment: z.unknown() as z.ZodType<any>,
  }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("no_assignment_in_session") }),
]);

export const showAssignmentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "assignment.show",
  description:
    "Display the active assignment in the chat surface. The student already sees the card; call this if they ask 'what was that quiz again?' or if you want to redirect attention to it. If no assignmentId is provided, uses the session's bound assignmentId.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) {
    const id = args.assignmentId ?? ctx.assignmentId;
    if (!id) return { kind: "no_assignment_in_session" as const };
    const assignment = await ctx.services.assignments.get({
      assignmentId: brandId<"AssignmentId">(id),
    });
    if (!assignment) return { kind: "not_found" as const };
    return { kind: "ok" as const, assignment };
  },
};
