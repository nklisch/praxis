/**
 * Zod discriminated union for AssignmentItem validation.
 *
 * This schema is used by the assignment.create tool to validate items at the
 * tool boundary (fail fast). The AssignmentItemSchema exported from
 * assignment-service.ts is the canonical source of truth; this module re-uses
 * the same structure to avoid divergence, and adds the validateForMode helper
 * used by the create tool.
 *
 * Single source of truth: AssignmentServiceImpl.validateItems in core also
 * validates using the same shape. The schemas are kept in sync by convention.
 */
import { z } from "zod";

export const RubricSchema = z.object({
  criteria: z
    .array(
      z.object({
        id: z.string().min(1),
        description: z.string().min(1),
        weight: z.number().min(0).max(1),
        anchors: z
          .array(
            z.object({
              score: z.number().int().min(0).max(10),
              description: z.string().min(1),
            }),
          )
          .optional(),
      }),
    )
    .min(1)
    .refine((criteria) => Math.abs(criteria.reduce((s, c) => s + c.weight, 0) - 1.0) < 0.01, {
      message: "Criterion weights must sum to 1.0 (within ±0.01)",
    }),
  maxScore: z.number().positive(),
});

const BaseItem = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  /** Phase 8 v2: optional partial-credit rubric for math/code work. */
  workRubric: RubricSchema.optional(),
  /** Default 0.5 for quiz/homework, 1.0 for exam. Validated 0..1. */
  primaryWeight: z.number().min(0).max(1).optional(),
});

export const AssignmentItemSchema = z.discriminatedUnion("kind", [
  BaseItem.extend({
    kind: z.literal("multiple-choice"),
    options: z.array(z.string()).min(2),
    correctOptionIndex: z.number().int().nonnegative(),
  }),
  BaseItem.extend({
    kind: z.literal("short-answer"),
    acceptedAnswers: z.array(z.string()).min(1),
    acceptedAnswerMatch: z.enum(["exact", "substring", "normalized"]).optional(),
  }),
  BaseItem.extend({
    kind: z.literal("math"),
    expectedSolution: z.object({
      variable: z.string().min(1),
      value: z.string().min(1),
    }),
  }),
  BaseItem.extend({
    kind: z.literal("code"),
    language: z.enum(["javascript", "python"]),
    testCases: z
      .array(
        z.object({
          stdin: z.string().optional(),
          expectedStdout: z.string(),
          timeoutMs: z.number().int().positive().optional(),
        }),
      )
      .min(1),
  }),
  BaseItem.extend({
    kind: z.literal("free-response"),
    rubric: RubricSchema.optional(),
    acceptedAnswers: z.array(z.string()).optional(),
    acceptedAnswerMatch: z.enum(["exact", "substring", "normalized"]).optional(),
  }),
]);

/**
 * Mode-aware additional validation. Exam free-response items MUST have a rubric.
 * Called by the assignment.create tool after the per-kind schema validates.
 */
export function validateForMode(
  items: z.infer<typeof AssignmentItemSchema>[],
  mode: "quiz" | "homework" | "exam",
): void {
  if (mode === "exam") {
    for (const item of items) {
      if (item.kind === "free-response" && !item.rubric) {
        throw new Error(`Exam free-response items require a rubric: item "${item.id}" has none`);
      }
    }
  }
}
