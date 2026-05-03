import { z } from "zod";

/**
 * Zod schema mirroring the `AssessmentPlan` domain type from artifacts.ts.
 * Used by the `course.draft_set_assessment_plan` tool's input schema.
 */
export const AssessmentPlanSchema = z.object({
  perLesson: z.object({
    homework: z.boolean().describe("Whether every lesson gets a homework assignment."),
    quizFrequency: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0 = no quizzes; N = quiz every Nth lesson."),
  }),
  summatives: z.array(
    z.object({
      kind: z.enum(["midterm", "unit_exam", "final"]),
      afterUnitOrderIndex: z
        .number()
        .int()
        .min(0)
        .describe("Place this exam after the unit with this orderIndex (0-based)."),
      title: z.string().min(1),
    }),
  ),
  pacing: z
    .object({
      sessionsPerWeek: z.number().int().min(1).optional(),
      weeksTotal: z.number().int().min(1).optional(),
    })
    .optional()
    .describe("Optional pacing hints for a future calendar-pacing phase."),
});
