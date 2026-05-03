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
  Engine,
  Grade,
  GradeItem,
  Logger,
  StudentId,
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

const MultipleChoiceItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("multiple-choice"),
  prompt: z.string().min(1),
  options: z.array(z.string()).min(2),
  correctOptionIndex: z.number().int().min(0),
  authoredBy: z.enum(["tutor", "configurator"]).optional(),
});

const ShortAnswerItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("short-answer"),
  prompt: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  acceptedAnswerMatch: z.enum(["exact", "substring", "normalized"]).optional(),
  authoredBy: z.enum(["tutor", "configurator"]).optional(),
});

const FreeResponseItemBaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("free-response"),
  prompt: z.string().min(1),
  rubric: RubricSchema.optional(),
  acceptedAnswers: z.array(z.string().min(1)).optional(),
  acceptedAnswerMatch: z.enum(["exact", "substring", "normalized"]).optional(),
  authoredBy: z.enum(["tutor", "configurator"]).optional(),
});

const MathItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("math"),
  prompt: z.string().min(1),
  expectedSolution: z.object({
    variable: z.string().min(1),
    value: z.string().min(1),
  }),
  workRubric: RubricSchema.optional(),
  primaryWeight: z.number().min(0).max(1).optional(),
  authoredBy: z.enum(["tutor", "configurator"]).optional(),
});

const CodeItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("code"),
  prompt: z.string().min(1),
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
  authoredBy: z.enum(["tutor", "configurator"]).optional(),
});

/**
 * AssignmentItemSchema — exported for Agent 2's assignment.create tool.
 * Discriminated union by `kind`; Zod enforces required fields per kind.
 */
export const AssignmentItemSchema = z.discriminatedUnion("kind", [
  MultipleChoiceItemSchema,
  ShortAnswerItemSchema,
  FreeResponseItemBaseSchema,
  MathItemSchema,
  CodeItemSchema,
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
    if (item.rubric) {
      validateRubricWeights(item.rubric, `item ${item.id} rubric`);
    }
    if (item.workRubric) {
      validateRubricWeights(item.workRubric, `item ${item.id} workRubric`);
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
  };
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
  }): Promise<{ assignmentId: AssignmentId }> {
    if (input.items.length === 0) {
      throw new Error("Assignment must have at least one item");
    }

    // Fail fast: validate each item at the boundary.
    validateItems(input.items, input.kind);

    const id = uuidv7();
    const now = new Date();

    // Propagate authoredBy to items that don't have it set.
    const itemsWithProvenance = input.items.map((it) => ({
      ...it,
      authoredBy: it.authoredBy ?? input.authoredBy ?? "tutor",
    }));

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
  }): Promise<void> {
    const now = new Date();
    // Drizzle with exactOptionalPropertyTypes requires null (not undefined) for nullable text columns.
    const workValue: string | null = input.work ?? null;
    const sketchIdValue: string | null = input.sketchId ?? null;
    this.deps.db
      .insert(assignmentResponses)
      .values({
        assignmentId: input.assignmentId,
        itemId: input.itemId,
        response: input.response,
        work: workValue,
        sketchId: sketchIdValue,
        recordedAt: now,
      })
      .onConflictDoUpdate({
        target: [assignmentResponses.assignmentId, assignmentResponses.itemId],
        set: {
          response: input.response,
          work: workValue,
          sketchId: sketchIdValue,
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
      recordedAt: r.recordedAt.getTime() as Timestamp,
    }));
  }

  async submit(input: {
    assignmentId: AssignmentId;
    responses?: AssignmentResponse[];
  }): Promise<AssignmentSubmissionResult> {
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

      // 2. workRubric blending — only for math/code items with workRubric set
      //    AND when the student submitted non-empty work text.
      if (
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
    if (!row || !row.submittedAt) return null;
    const grade = row.gradeJson as { total: number } | null;
    if (!grade) return null;
    return {
      total: grade.total,
      submittedAt: row.submittedAt.getTime() as Timestamp,
    };
  }
}
