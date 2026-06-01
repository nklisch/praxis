/**
 * AssignmentServiceImpl — orchestrates assignment lifecycle:
 *   create (validate + persist) → recordResponse (upsert) → submit (grade + persist)
 *
 * Step 4 of the grading-extraction refactor: submit() now delegates the grading
 * loop to GradingOrchestratorImpl. The service is a slim facade that owns DB I/O
 * and the notifyParentSession side-effect; the orchestrator owns the per-item loop.
 *
 * Phase 3 dependency exception: this file is in `services/` and may import
 * @praxis/engines at runtime (via GradingOrchestratorImpl → graders/rubric-agent.ts).
 */

import { assignmentResponses, assignments } from "@praxis/artifacts/schema";
import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
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
  Logger,
  SessionId,
  StudentId,
  SystemNoteOrigin,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import type { GradingOrchestrator } from "./graders/grading-orchestrator.js";
import { GradingOrchestratorImpl } from "./graders/grading-orchestrator.js";
import { AssignmentItemSchema, validateItems } from "./graders/item-schemas.js";
import { composeSubmissionNote, rowToAssignment } from "./graders/submission-helpers.js";
import type { GraderServices } from "./graders/types.js";

// ─── Re-exports for downstream callers ────────────────────────────────────────
// These were defined inline here before Step 3; now they live in graders/.
// Re-exported here so imports from "@praxis/core/services" continue to resolve.
export { AssignmentItemSchema, validateItems };

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
  /**
   * Pre-wired orchestrator. When omitted, AssignmentServiceImpl constructs
   * GradingOrchestratorImpl internally from graderServices + enableApproachFeedback.
   * Passing an explicit orchestrator is useful for injection in tests.
   *
   * TODO: In a follow-on refactor, move graderServices and enableApproachFeedback
   * out of AssignmentServiceDeps entirely and require callers to pass orchestrator.
   */
  orchestrator?: GradingOrchestrator;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class AssignmentServiceImpl implements AssignmentService, GradeReader {
  private readonly orchestrator: GradingOrchestrator;

  constructor(private readonly deps: AssignmentServiceDeps) {
    // Use the injected orchestrator when provided; otherwise construct one from
    // graderServices + enableApproachFeedback (backward-compat construction path).
    this.orchestrator =
      deps.orchestrator ??
      new GradingOrchestratorImpl({
        log: deps.log,
        graderServices: deps.graderServices,
        ...(deps.enableApproachFeedback !== undefined && {
          enableApproachFeedback: deps.enableApproachFeedback,
        }),
      });
  }

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
    // 1. Read the raw row to access parentSessionId (not in the domain Assignment type).
    const assignmentRow = this.deps.db
      .select()
      .from(assignments)
      .where(eq(assignments.id, input.assignmentId))
      .get();
    if (!assignmentRow) throw new Error(`Assignment not found: ${input.assignmentId}`);

    // 2. Load the domain Assignment and guard against double-submission.
    const assignment = rowToAssignment(assignmentRow);
    if (assignment.submittedAt) {
      throw new Error(`Assignment already submitted: ${input.assignmentId}`);
    }

    const submittedAt = new Date();
    const claimResult = this.deps.db
      .update(assignments)
      .set({ submittedAt })
      .where(and(eq(assignments.id, input.assignmentId), isNull(assignments.submittedAt)))
      .run();
    if (claimResult.changes === 0) {
      const current = await this.get({ assignmentId: input.assignmentId });
      if (current?.grade) {
        throw new Error(`Assignment already submitted: ${input.assignmentId}`);
      }
      throw new Error(`Assignment submission already in progress: ${input.assignmentId}`);
    }

    // 3. Load responses (use caller-supplied or read from DB).
    const responses =
      input.responses ?? (await this.getResponses({ assignmentId: input.assignmentId }));

    // 4. Resolve the submission mode from the session that owns this assignment.
    const mode = this.deps.resolveSubmissionMode(input.assignmentId);

    let grade: Grade;
    try {
      // 5. Delegate grading to the orchestrator after this caller has claimed submission.
      grade = await this.orchestrator.gradeAssignment({ assignment, responses, mode });
    } catch (err) {
      this.deps.db
        .update(assignments)
        .set({ submittedAt: null, gradeJson: null })
        .where(
          and(
            eq(assignments.id, input.assignmentId),
            eq(assignments.submittedAt, submittedAt),
            isNull(assignments.gradeJson),
          ),
        )
        .run();
      throw err;
    }

    // 6. Persist: mark submitted + write grade.
    const finalizeResult = this.deps.db
      .update(assignments)
      .set({ gradeJson: grade })
      .where(
        and(
          eq(assignments.id, input.assignmentId),
          eq(assignments.submittedAt, submittedAt),
          isNull(assignments.gradeJson),
        ),
      )
      .run();
    if (finalizeResult.changes === 0) {
      throw new Error(`Assignment submission claim lost before finalize: ${input.assignmentId}`);
    }

    // 7. Phase 16: notify parent teach-mode session if this assignment was authored live.
    //    Fire-and-forget — don't block submit() on the notification. Non-fatal if it fails.
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

    // 8. Return submission result.
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
