import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const SummativeSchema = z.object({
  kind: z.enum(["quiz", "homework", "exam"]),
  title: z.string().min(1).describe("Assessment title, e.g. 'Unit 1 Exam'."),
  conceptNames: z
    .array(z.string())
    .min(1)
    .describe("Concept names (from the draft) this summative covers."),
  expectedItemCount: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Editorial hint for the configurator — how many items to author."),
  rationale: z.string().min(1).describe("Why is this assessment here? What should it verify?"),
});

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  name: z.string().min(1).describe("Unit name, e.g. 'Foundations of Algebra'."),
  summary: z.string().optional().describe("Optional editorial blurb describing the unit's theme."),
  draftLessonIds: z
    .array(z.string())
    .min(1)
    .describe(
      "Draft lesson ids (from course.draft_add_lessons) belonging to this unit, in study order.",
    ),
  summative: SummativeSchema.optional().describe(
    "Optional summative assessment at the end of this unit (e.g. unit exam, midterm).",
  ),
});

const OutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), draftUnitId: z.string() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const draftAddUnitTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_add_unit",
  description:
    "Group draft lessons into a named unit. Every draftLessonId must already exist in the draft. Optionally attach a summative assessment at the end of the unit.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) return { ok: false as const, reason: "no draftId in args or session context" };
    const summative =
      args.summative !== undefined
        ? {
            kind: args.summative.kind,
            title: args.summative.title,
            conceptNames: args.summative.conceptNames,
            rationale: args.summative.rationale,
            ...(args.summative.expectedItemCount !== undefined && {
              expectedItemCount: args.summative.expectedItemCount,
            }),
          }
        : undefined;

    return ctx.services.bootstrap.addUnit({
      draftId,
      name: args.name,
      ...(args.summary !== undefined && { summary: args.summary }),
      draftLessonIds: args.draftLessonIds,
      ...(summative !== undefined && { summative }),
    });
  },
};
