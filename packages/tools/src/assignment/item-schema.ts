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
  authoredBy: z.enum(["tutor", "configurator"]).optional(),
});

/** Shared fields for choice kinds that support requireReasoning. */
const WithReasoning = z.object({
  requireReasoning: z.boolean().optional(),
  reasoningRubric: RubricSchema.optional(),
  primaryWeight: z.number().min(0).max(1).optional(),
});

export const AssignmentItemSchema = z.discriminatedUnion("kind", [
  // ── single-choice (renamed from multiple-choice) ──────────────────────────
  BaseItem.merge(WithReasoning)
    .extend({
      kind: z.literal("single-choice"),
      options: z.array(z.string()).min(2),
      correctOptionIndex: z.number().int().nonnegative(),
    })
    .refine((item) => !item.requireReasoning || item.reasoningRubric !== undefined, {
      message: "reasoningRubric is required when requireReasoning is true",
    }),

  // ── multi-select ──────────────────────────────────────────────────────────
  BaseItem.merge(WithReasoning)
    .extend({
      kind: z.literal("multi-select"),
      options: z.array(z.string()).min(2),
      correctOptionIndices: z.array(z.number().int().nonnegative()).min(1),
    })
    .refine((item) => !item.requireReasoning || item.reasoningRubric !== undefined, {
      message: "reasoningRubric is required when requireReasoning is true",
    }),

  // ── short-answer ──────────────────────────────────────────────────────────
  BaseItem.extend({
    kind: z.literal("short-answer"),
    acceptedAnswers: z.array(z.string()).min(1),
    acceptedAnswerMatch: z.enum(["exact", "substring", "normalized"]).optional(),
  }),

  // ── math ──────────────────────────────────────────────────────────────────
  BaseItem.extend({
    kind: z.literal("math"),
    expectedSolution: z.object({
      variable: z.string().min(1),
      value: z.string().min(1),
    }),
    workRubric: RubricSchema.optional(),
    primaryWeight: z.number().min(0).max(1).optional(),
  }),

  // ── code ──────────────────────────────────────────────────────────────────
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
    workRubric: RubricSchema.optional(),
    primaryWeight: z.number().min(0).max(1).optional(),
  }),

  // ── free-response ─────────────────────────────────────────────────────────
  BaseItem.extend({
    kind: z.literal("free-response"),
    rubric: RubricSchema.optional(),
    acceptedAnswers: z.array(z.string()).optional(),
    acceptedAnswerMatch: z.enum(["exact", "substring", "normalized"]).optional(),
  }),

  // ── numerical ─────────────────────────────────────────────────────────────
  BaseItem.extend({
    kind: z.literal("numerical"),
    expectedValue: z.number(),
    tolerance: z.number().nonnegative().optional(),
    expectedUnits: z.string().optional(),
    significantFigures: z.number().int().positive().optional(),
    workRubric: RubricSchema.optional(),
    primaryWeight: z.number().min(0).max(1).optional(),
  }),

  // ── matching ──────────────────────────────────────────────────────────────
  BaseItem.extend({
    kind: z.literal("matching"),
    leftItems: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(1),
    rightItems: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(1),
    correctPairs: z
      .array(z.object({ leftId: z.string().min(1), rightId: z.string().min(1) }))
      .min(1),
  }).refine(
    (item) => {
      const leftIds = new Set(item.leftItems.map((i) => i.id));
      const rightIds = new Set(item.rightItems.map((i) => i.id));
      return item.correctPairs.every((p) => leftIds.has(p.leftId) && rightIds.has(p.rightId));
    },
    { message: "correctPairs must reference valid leftItems and rightItems ids" },
  ),

  // ── ordering ──────────────────────────────────────────────────────────────
  BaseItem.extend({
    kind: z.literal("ordering"),
    items: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2),
    correctOrder: z.array(z.string().min(1)).min(2),
  }).refine(
    (item) => {
      const itemIds = new Set(item.items.map((i) => i.id));
      if (item.correctOrder.length !== item.items.length) return false;
      const orderSet = new Set(item.correctOrder);
      if (orderSet.size !== item.correctOrder.length) return false; // duplicates
      return item.correctOrder.every((id) => itemIds.has(id));
    },
    { message: "correctOrder must be a permutation of items[].id" },
  ),

  // ── two-tier ──────────────────────────────────────────────────────────────
  BaseItem.merge(WithReasoning)
    .extend({
      kind: z.literal("two-tier"),
      options: z.array(z.string()).min(2),
      correctOptionIndex: z.number().int().nonnegative(),
      reasonPrompt: z.string().min(1),
      reasonOptions: z.array(z.string()).min(2),
      correctReasonIndex: z.number().int().nonnegative(),
      misconceptionByReasonIndex: z.array(z.string().nullable()),
    })
    .refine((item) => item.misconceptionByReasonIndex.length === item.reasonOptions.length, {
      message: "misconceptionByReasonIndex.length must equal reasonOptions.length",
    })
    .refine((item) => !item.requireReasoning || item.reasoningRubric !== undefined, {
      message: "reasoningRubric is required when requireReasoning is true",
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
