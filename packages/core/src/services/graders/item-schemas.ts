/**
 * item-schemas.ts — Zod validation schemas for all AssignmentItem kinds.
 *
 * Extracted from assignment-service.ts (was lines 40–254).
 * These schemas are the single source of truth for structural validation at
 * item create-time. They are consumed by:
 *   - validateItems (exported — used at the tool boundary in @praxis/tools)
 *   - assignment-service.ts (re-exports AssignmentItemSchema + validateItems)
 *
 * No dependency on CRUD logic or DB — safe to import anywhere in the grading path.
 */

import { z } from "zod";
import type { AssignmentItem } from "../../types/artifacts.js";

// ─── Shared building blocks ────────────────────────────────────────────────────

const RubricCriterionSchema = z.object({
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
});

const RubricSchema = z.object({
  criteria: z.array(RubricCriterionSchema).min(1),
  maxScore: z.number().positive(),
});

const BaseItem = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  authoredBy: z.enum(["tutor", "configurator"]).optional(),
});

const WithReasoning = z.object({
  requireReasoning: z.boolean().optional(),
  reasoningRubric: RubricSchema.optional(),
  primaryWeight: z.number().min(0).max(1).optional(),
});

// ─── Discriminated union ───────────────────────────────────────────────────────

/**
 * AssignmentItemSchema — discriminated union by `kind`.
 * Kept in sync with packages/tools/src/assignment/item-schema.ts.
 * (core/services/ may not import @praxis/tools at schema-definition time
 * but this is a parallel definition per design.)
 */
export const AssignmentItemSchema = z.discriminatedUnion("kind", [
  // single-choice (renamed from multiple-choice in Phase 17)
  BaseItem.merge(WithReasoning)
    .extend({
      kind: z.literal("single-choice"),
      options: z.array(z.string()).min(2),
      correctOptionIndex: z.number().int().nonnegative(),
    })
    .refine((item) => !item.requireReasoning || item.reasoningRubric !== undefined, {
      message: "reasoningRubric is required when requireReasoning is true",
    }),

  // multi-select
  BaseItem.merge(WithReasoning)
    .extend({
      kind: z.literal("multi-select"),
      options: z.array(z.string()).min(2),
      correctOptionIndices: z.array(z.number().int().nonnegative()).min(1),
    })
    .refine((item) => !item.requireReasoning || item.reasoningRubric !== undefined, {
      message: "reasoningRubric is required when requireReasoning is true",
    }),

  // short-answer
  BaseItem.extend({
    kind: z.literal("short-answer"),
    acceptedAnswers: z.array(z.string().min(1)).min(1),
    acceptedAnswerMatch: z.enum(["exact", "substring", "normalized"]).optional(),
  }),

  // math
  BaseItem.extend({
    kind: z.literal("math"),
    expectedSolution: z.object({
      variable: z.string().min(1),
      value: z.string().min(1),
    }),
    workRubric: RubricSchema.optional(),
    primaryWeight: z.number().min(0).max(1).optional(),
  }),

  // code
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

  // free-response
  BaseItem.extend({
    kind: z.literal("free-response"),
    rubric: RubricSchema.optional(),
    acceptedAnswers: z.array(z.string().min(1)).optional(),
    acceptedAnswerMatch: z.enum(["exact", "substring", "normalized"]).optional(),
  }),

  // numerical
  BaseItem.extend({
    kind: z.literal("numerical"),
    expectedValue: z.number(),
    tolerance: z.number().nonnegative().optional(),
    expectedUnits: z.string().optional(),
    significantFigures: z.number().int().positive().optional(),
    workRubric: RubricSchema.optional(),
    primaryWeight: z.number().min(0).max(1).optional(),
  }),

  // matching
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

  // ordering
  BaseItem.extend({
    kind: z.literal("ordering"),
    items: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2),
    correctOrder: z.array(z.string().min(1)).min(2),
  }).refine(
    (item) => {
      const itemIds = new Set(item.items.map((i) => i.id));
      if (item.correctOrder.length !== item.items.length) return false;
      const orderSet = new Set(item.correctOrder);
      if (orderSet.size !== item.correctOrder.length) return false;
      return item.correctOrder.every((id) => itemIds.has(id));
    },
    { message: "correctOrder must be a permutation of items[].id" },
  ),

  // two-tier
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

// ─── Item validation ───────────────────────────────────────────────────────────

/**
 * Validate all items in an assignment at create time.
 * Exam mode adds extra constraints: free-response items MUST have a rubric.
 *
 * Exported for Agent 2 (assignment.create tool) to call at the tool boundary.
 */
export function validateItems(items: AssignmentItem[], mode: "quiz" | "homework" | "exam"): void {
  for (const item of items) {
    // Per-kind structural validation.
    const parsed = AssignmentItemSchema.safeParse(item);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid item ${item.id} (kind: ${item.kind}): ${issues}`);
    }

    // Rubric weight sum validation for items that have a rubric.
    if ("rubric" in item && item.rubric) {
      validateRubricWeights(item.rubric, `item ${item.id} rubric`);
    }
    if ("workRubric" in item && item.workRubric) {
      validateRubricWeights(item.workRubric, `item ${item.id} workRubric`);
    }
    if ("reasoningRubric" in item && item.reasoningRubric) {
      validateRubricWeights(item.reasoningRubric, `item ${item.id} reasoningRubric`);
    }

    // Exam mode: free-response items MUST have a rubric.
    if (mode === "exam" && item.kind === "free-response" && !item.rubric) {
      throw new Error(
        `Exam mode requires a rubric on all free-response items, but item ${item.id} has none. ` +
          "Either add a rubric or use acceptedAnswers (for quiz/homework only).",
      );
    }
  }
}

export function validateRubricWeights(
  rubric: { criteria: Array<{ weight: number }> },
  label: string,
): void {
  const sum = rubric.criteria.reduce((acc, c) => acc + c.weight, 0);
  if (Math.abs(sum - 1.0) > 0.01) {
    throw new Error(
      `Rubric criterion weights must sum to 1.0 (within ±0.01); got ${sum.toFixed(4)} on ${label}`,
    );
  }
}
