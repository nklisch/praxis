/**
 * AssignmentServiceImpl — orchestrates assignment lifecycle:
 *   create (validate + persist) → recordResponse (upsert) → submit (grade + persist)
 *
 * Phase 3 dependency exception: this file is in `services/` and may import
 * @praxis/engines at runtime (via graders/rubric-agent.ts → runOneShot).
 */

import { assignmentResponses, assignments } from "@praxis/artifacts/schema";
import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { PraxisDb } from "../db/index.js";
import type { GradeReader } from "../types/gate.js";
import type {
  Assignment,
  AssignmentId,
  AssignmentItem,
  AssignmentResponse,
  AssignmentService,
  AssignmentSubmissionResult,
  ConceptId,
  CourseId,
  Grade,
  GradeItem,
  Logger,
  SessionId,
  StudentId,
  SystemNoteOrigin,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import { enrichWithApproachFeedback } from "./graders/approach-feedback.js";
import { buildGraderRegistry } from "./graders/registry.js";
import { runRubricAgent } from "./graders/rubric-agent.js";
import type { GraderContext, GraderResult, GraderServices } from "./graders/types.js";

// ─── Zod validation schemas ────────────────────────────────────────────────────

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

function validateRubricWeights(
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

// ─── DB row → domain type ─────────────────────────────────────────────────────

type AssignmentRow = typeof assignments.$inferSelect;

function rowToAssignment(row: AssignmentRow): Assignment {
  return {
    id: brandId<"AssignmentId">(row.id),
    courseId: brandId<"CourseId">(row.courseId),
    kind: row.kind,
    title: row.title,
    items: row.itemsJson as AssignmentItem[],
    conceptIds: (row.conceptIdsJson as string[]).map((id) => brandId<"ConceptId">(id)),
    assignedAt: row.assignedAt.getTime() as Timestamp,
    ...(row.submittedAt !== null &&
      row.submittedAt !== undefined && {
        submittedAt: row.submittedAt.getTime() as Timestamp,
      }),
    ...(row.gradeJson !== null &&
      row.gradeJson !== undefined && {
        grade: row.gradeJson as Grade,
      }),
    ...(row.durationMinutes !== null &&
      row.durationMinutes !== undefined && {
        durationMinutes: row.durationMinutes,
      }),
  };
}

/**
 * Composes the human-readable note the tutor sees as a system_note event.
 * Structured for model parseability: one sentence header, aggregate line, item breakdown.
 */
function composeSubmissionNote(input: {
  assignment: Assignment;
  grade: Grade;
  submittedAt: Date;
}): string {
  const total = Math.round(input.grade.total * 100);
  const lines: string[] = [];
  lines.push(`The student just submitted ${input.assignment.kind}: ${input.assignment.title}.`);
  lines.push(`Aggregate score: ${total}% (graded by: ${input.grade.reviewedBy}).`);
  lines.push("");
  lines.push("Per-item breakdown:");
  for (const item of input.grade.perItem) {
    const score = item.score === null ? "needs review" : `${Math.round(item.score * 100)}%`;
    lines.push(`- item ${item.itemId} (${item.gradedBy}): ${score} — ${item.feedback}`);
  }
  lines.push("");
  lines.push(
    "Narrate per-item feedback warmly. On misses, name the misconception and offer to work it through. Then return to the lesson.",
  );
  return lines.join("\n");
}

// ─── workRubric blending ───────────────────────────────────────────────────────

/**
 * Blend deterministic grader result + work-rubric agent result via primaryWeight.
 *
 * total = primaryWeight × deterministicScore + (1 - primaryWeight) × workScore
 *
 * When either side is needs-human-review (score null): fall back to the side
 * that succeeded, or null if both fail.
 */
function blendDeterministicAndWorkRubric(
  base: GraderResult,
  work: GraderResult,
  primaryWeight: number,
): GraderResult {
  if (base.score === null || work.score === null) {
    // One side failed — use the other when available.
    if (work.score !== null) return work;
    if (base.score !== null) return base;
    return { score: null, feedback: "needs-human-review", tier: "needs-human-review" };
  }
  const blended = primaryWeight * base.score + (1 - primaryWeight) * work.score;
  const result: GraderResult = {
    score: Math.max(0, Math.min(1, blended)),
    feedback: `${base.feedback}\n\nWork: ${work.feedback}`,
    tier: "rubric-agent", // LLM was involved
  };
  if (work.perCriterion !== undefined) {
    result.perCriterion = work.perCriterion;
  }
  if (work.evidenceEventIds !== undefined) {
    result.evidenceEventIds = work.evidenceEventIds;
  }
  return result;
}

// ─── Service deps ─────────────────────────────────────────────────────────────

export interface AssignmentServiceDeps {
  db: PraxisDb;
  log: Logger;
  graderServices: GraderServices;
  /**
   * Resolves the assignment's mode at submit time. The session that's submitting
   * the assignment carries the mode; the service reads it via this closure.
   * Defaults to "quiz" when no session can be resolved.
   *
   * Agent 2 wires this from the session row's modeId field.
   */
  resolveSubmissionMode: (assignmentId: AssignmentId) => "quiz" | "homework" | "exam";
  /**
   * Whether to run the approach-feedback layer for incorrect items in
   * quiz/homework. Default true. Set false in tests to avoid LLM calls.
   */
  enableApproachFeedback?: boolean;
  /**
   * Phase 16: callback port to notify the parent teach-mode session after
   * submission. Optional — tests and course-create-mode grading omit it. When
   * wired, `services.ts` provides a closure that calls
   * `sessionService.notifySession(...)`.
   *
   * Kept as a port (not a direct SessionService reference) to avoid a
   * circular construction dependency in services.ts.
   */
  notifyParentSession?: (input: {
    parentSessionId: SessionId;
    note: string;
    origin: SystemNoteOrigin;
  }) => Promise<void>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class AssignmentServiceImpl implements AssignmentService, GradeReader {
  private readonly registry = buildGraderRegistry();

  constructor(private readonly deps: AssignmentServiceDeps) {}

  async create(input: {
    courseId: CourseId;
    studentId: StudentId;
    kind: "quiz" | "homework" | "exam";
    title: string;
    items: AssignmentItem[];
    conceptIds: ConceptId[];
    authoredBy?: "tutor" | "configurator";
    /** Phase 16: teach-mode session that authored this assignment via the tool. */
    parentSessionId?: SessionId;
    /** Optional time limit in minutes. Null for untimed. Only meaningful for exam kind. */
    durationMinutes?: number | null;
  }): Promise<{ assignmentId: AssignmentId }> {
    if (input.items.length === 0) {
      throw new Error("Assignment must have at least one item");
    }

    // Fail fast: validate each item at the boundary.
    validateItems(input.items, input.kind);

    const id = uuidv7();
    const now = new Date();

    // Propagate authoredBy to items that don't have it set.
    // structured-question items are not assessment items and don't carry authoredBy;
    // all other item kinds have the optional authoredBy field.
    const itemsWithProvenance = input.items.map((it) => {
      if (it.kind === "structured-question") return it;
      return {
        ...it,
        authoredBy: it.authoredBy ?? input.authoredBy ?? "tutor",
      };
    });

    // Drizzle with exactOptionalPropertyTypes requires null (not undefined) for nullable columns.
    const parentSessionIdValue: string | null = input.parentSessionId ?? null;
    const durationMinutesValue: number | null = input.durationMinutes ?? null;

    this.deps.db
      .insert(assignments)
      .values({
        id,
        courseId: input.courseId,
        kind: input.kind,
        title: input.title,
        itemsJson: itemsWithProvenance,
        conceptIdsJson: input.conceptIds,
        assignedAt: now,
        parentSessionId: parentSessionIdValue,
        durationMinutes: durationMinutesValue,
      })
      .run();

    return { assignmentId: brandId<"AssignmentId">(id) };
  }

  async get(input: { assignmentId: AssignmentId }): Promise<Assignment | null> {
    const row = this.deps.db
      .select()
      .from(assignments)
      .where(eq(assignments.id, input.assignmentId))
      .get();
    if (!row) return null;
    return rowToAssignment(row);
  }

  async list(input: {
    courseId: CourseId;
    kind?: "quiz" | "homework" | "exam";
  }): Promise<Assignment[]> {
    const where = input.kind
      ? and(eq(assignments.courseId, input.courseId), eq(assignments.kind, input.kind))
      : eq(assignments.courseId, input.courseId);
    const rows = this.deps.db.select().from(assignments).where(where).all();
    return rows.map(rowToAssignment);
  }

  async recordResponse(input: {
    assignmentId: AssignmentId;
    itemId: string;
    response: string;
    work?: string;
    /** Phase 15a: optional sketch attached to this response. */
    sketchId?: string;
    /** Confidence band — formative self-assessment signal per quiz item. Optional. */
    confidence?: "guessed" | "unsure" | "pretty_sure" | "certain";
  }): Promise<void> {
    const now = new Date();
    // Drizzle with exactOptionalPropertyTypes requires null (not undefined) for nullable text columns.
    const workValue: string | null = input.work ?? null;
    const sketchIdValue: string | null = input.sketchId ?? null;
    const confidenceValue: "guessed" | "unsure" | "pretty_sure" | "certain" | null =
      input.confidence ?? null;
    this.deps.db
      .insert(assignmentResponses)
      .values({
        assignmentId: input.assignmentId,
        itemId: input.itemId,
        response: input.response,
        work: workValue,
        sketchId: sketchIdValue,
        confidence: confidenceValue,
        recordedAt: now,
      })
      .onConflictDoUpdate({
        target: [assignmentResponses.assignmentId, assignmentResponses.itemId],
        set: {
          response: input.response,
          work: workValue,
          sketchId: sketchIdValue,
          confidence: confidenceValue,
          recordedAt: now,
        },
      })
      .run();
  }

  async getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]> {
    const rows = this.deps.db
      .select()
      .from(assignmentResponses)
      .where(eq(assignmentResponses.assignmentId, input.assignmentId))
      .all();
    return rows.map((r) => ({
      assignmentId: brandId<"AssignmentId">(r.assignmentId),
      itemId: r.itemId,
      response: r.response,
      ...(r.work !== null && r.work !== undefined && { work: r.work }),
      ...(r.sketchId !== null && r.sketchId !== undefined && { sketchId: r.sketchId }),
      ...(r.confidence !== null && r.confidence !== undefined && { confidence: r.confidence }),
      recordedAt: r.recordedAt.getTime() as Timestamp,
    }));
  }

  async submit(input: {
    assignmentId: AssignmentId;
    responses?: AssignmentResponse[];
    /** Phase 16: the child session that is submitting (for the origin payload). */
    submittingSessionId?: SessionId;
  }): Promise<AssignmentSubmissionResult> {
    // Read the raw row to access parentSessionId (not in the domain Assignment type).
    const assignmentRow = this.deps.db
      .select()
      .from(assignments)
      .where(eq(assignments.id, input.assignmentId))
      .get();
    if (!assignmentRow) throw new Error(`Assignment not found: ${input.assignmentId}`);

    const assignment = await this.get({ assignmentId: input.assignmentId });
    if (!assignment) throw new Error(`Assignment not found: ${input.assignmentId}`);
    if (assignment.submittedAt) {
      throw new Error(`Assignment already submitted: ${input.assignmentId}`);
    }

    const responses =
      input.responses ?? (await this.getResponses({ assignmentId: input.assignmentId }));
    const responseByItemId = new Map(responses.map((r) => [r.itemId, r]));

    const mode = this.deps.resolveSubmissionMode(input.assignmentId);
    const ctx: GraderContext = {
      log: this.deps.log,
      services: this.deps.graderServices,
      mode,
    };

    const perItem: GradeItem[] = [];
    let totalScore = 0;
    let scoredItemCount = 0;
    let highestTier: GradeItem["gradedBy"] = "deterministic";

    for (const item of assignment.items) {
      const grader = this.registry[item.kind];
      const response = responseByItemId.get(item.id) ?? null;

      // 1. Run the kind-specific grader.
      let finalResult = await grader.grade({ item, response, ctx });

      // 2a. workRubric blending — only for math/code items with workRubric set
      //     AND when the student submitted non-empty work text.
      if (
        "workRubric" in item &&
        item.workRubric &&
        (item.kind === "math" || item.kind === "code") &&
        response &&
        response.work !== undefined &&
        response.work.trim() !== ""
      ) {
        const workResult = await runRubricAgent({
          item,
          rubric: item.workRubric,
          text: response.work,
          source: "work-rubric",
          ctx,
        });
        const primaryWeight = item.primaryWeight ?? (mode === "exam" ? 1.0 : 0.5);
        finalResult = blendDeterministicAndWorkRubric(finalResult, workResult, primaryWeight);
      }

      // 2b. requireReasoning blending — for single-choice / multi-select / two-tier
      //     when requireReasoning is set and the student submitted non-empty work.
      if (
        "requireReasoning" in item &&
        item.requireReasoning &&
        item.reasoningRubric &&
        response &&
        response.work !== undefined &&
        response.work.trim() !== ""
      ) {
        const reasoningResult = await runRubricAgent({
          item,
          rubric: item.reasoningRubric,
          text: response.work,
          source: "reasoning-rubric",
          ctx,
        });
        const primaryWeight = item.primaryWeight ?? (mode === "exam" ? 1.0 : 0.5);
        finalResult = blendDeterministicAndWorkRubric(finalResult, reasoningResult, primaryWeight);
      }

      // 2c. Misconception evidence — for two-tier items where tier-2 was wrong
      //     and the grader returned a misconceptionId.
      if (finalResult.misconceptionId) {
        // TODO Phase 17.5: write misconception evidence via ctx.services.memory.recordMisconception
        // The grader already surfaced the misconceptionId; the assignment service
        // needs access to studentId + conceptId to complete the write. Those are
        // available on the Assignment but not yet threaded into GraderContext.
        // For now, log a diagnostic so the misconception can be tracked manually.
        ctx.log.info("grader.misconception_detected", {
          itemId: item.id,
          misconceptionId: finalResult.misconceptionId,
        });
      }

      // 3. Approach-feedback fallback — only when no rubric/workRubric was used upstream.
      //    The skip rules inside enrichWithApproachFeedback cover the remaining cases.
      const enableApproach = this.deps.enableApproachFeedback ?? true;
      if (enableApproach) {
        finalResult = await enrichWithApproachFeedback({
          item,
          response: response?.response ?? null,
          base: finalResult,
          ctx,
        });
      }

      perItem.push({
        itemId: item.id,
        score: finalResult.score,
        feedback: finalResult.feedback,
        gradedBy: finalResult.tier,
        ...(finalResult.perCriterion && { perCriterion: finalResult.perCriterion }),
        ...(finalResult.evidenceEventIds && { evidenceEventIds: finalResult.evidenceEventIds }),
        ...(finalResult.misconceptionId && { misconceptionId: finalResult.misconceptionId }),
      });

      if (finalResult.score !== null) {
        totalScore += finalResult.score;
        scoredItemCount++;
      }

      // Track the highest tier seen.
      if (finalResult.tier === "needs-human-review") {
        highestTier = "needs-human-review";
      } else if (finalResult.tier === "rubric-agent" && highestTier !== "needs-human-review") {
        highestTier = "rubric-agent";
      }
    }

    const grade: Grade = {
      total: scoredItemCount > 0 ? totalScore / scoredItemCount : 0,
      perItem,
      reviewedBy: highestTier,
    };

    const submittedAt = new Date();
    this.deps.db
      .update(assignments)
      .set({ submittedAt, gradeJson: grade })
      .where(eq(assignments.id, input.assignmentId))
      .run();

    // Phase 16: notify parent teach-mode session if this assignment was authored live.
    if (assignmentRow.parentSessionId && this.deps.notifyParentSession) {
      const note = composeSubmissionNote({ assignment, grade, submittedAt });
      const childSessionId = input.submittingSessionId ?? "unknown";
      const origin: SystemNoteOrigin = {
        kind: "assignment_submission",
        assignmentId: input.assignmentId,
        childSessionId,
        gradeTotal: grade.total,
        submittedAt: submittedAt.getTime(),
      };
      // Fire-and-forget: don't block submit() on the notification. Non-fatal if it fails.
      this.deps
        .notifyParentSession({
          parentSessionId: brandId<"SessionId">(assignmentRow.parentSessionId),
          note,
          origin,
        })
        .catch((err: unknown) => {
          this.deps.log.warn("assignment.submit.notify_failed", {
            assignmentId: input.assignmentId,
            parentSessionId: assignmentRow.parentSessionId,
            err: err instanceof Error ? err.message : String(err),
          });
        });
    }

    return {
      assignmentId: input.assignmentId,
      grade,
      submittedAt: submittedAt.getTime() as Timestamp,
    };
  }

  // ── GradeReader.readGrade (Phase 9) ───────────────────────────────────────────

  /**
   * GradeReader port implementation. Returns total + submittedAt for a submitted
   * assignment, or null when unsubmitted or not found.
   */
  async readGrade(input: {
    assignmentId: string;
  }): Promise<{ total: number; submittedAt: Timestamp } | null> {
    const row = this.deps.db
      .select()
      .from(assignments)
      .where(eq(assignments.id, input.assignmentId))
      .get();
    if (!row?.submittedAt) return null;
    const grade = row.gradeJson as { total: number } | null;
    if (!grade) return null;
    return {
      total: grade.total,
      submittedAt: row.submittedAt.getTime() as Timestamp,
    };
  }
}
