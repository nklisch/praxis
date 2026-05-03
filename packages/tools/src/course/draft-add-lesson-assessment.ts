import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  draftLessonId: z
    .string()
    .describe("The lesson this assessment is attached to (from course.draft_add_lesson)."),
  title: z
    .string()
    .min(1)
    .describe("Assessment title, e.g. 'Lesson 3 Homework' or 'Readiness Check: Linear Equations'."),
  kind: z.enum(["quiz", "homework", "exam"]).describe("Assignment kind — quiz, homework, or exam."),
  timing: z
    .enum(["before", "after", "interleaved"])
    .describe(
      "When in the lesson flow this runs: 'before' = readiness check; 'after' = practice; 'interleaved' = woven in.",
    ),
  purpose: z
    .enum(["readiness", "practice", "checkpoint"])
    .describe(
      "Pedagogical role: 'readiness' = check prerequisites; 'practice' = deliberate practice; 'checkpoint' = verify mastery.",
    ),
  conceptNames: z
    .array(z.string())
    .min(1)
    .describe("Concept names (from the draft) this assessment covers."),
  expectedItemCount: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Editorial hint for the configurator — how many items to author. Typical: 5-8 for homework, 4-6 for quizzes.",
    ),
  rationale: z
    .string()
    .min(1)
    .describe(
      "Why is this assessment here? What should it verify? Used by the configurator as context.",
    ),
});

const OutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), draftAssessmentId: z.string() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const draftAddLessonAssessmentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> =
  {
    name: "course.draft_add_lesson_assessment",
    description:
      "Schedule a per-lesson assessment (homework, quiz, or readiness check) attached to a specific lesson. The draftLessonId must already exist and all conceptNames must be in the draft.",
    input: InputSchema,
    output: OutputSchema,
    tier: "grounded",
    effects: ["artifact.mutate"],
    async handler(args, ctx: ToolContext) {
      const draftId = args.draftId ?? ctx.draftId;
      if (!draftId) return { ok: false as const, reason: "no draftId in args or session context" };
      return ctx.services.bootstrap.addLessonAssessment({
        draftId,
        draftLessonId: args.draftLessonId,
        title: args.title,
        kind: args.kind,
        timing: args.timing,
        purpose: args.purpose,
        conceptNames: args.conceptNames,
        ...(args.expectedItemCount !== undefined && {
          expectedItemCount: args.expectedItemCount,
        }),
        rationale: args.rationale,
      });
    },
  };
