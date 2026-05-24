import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  AssessmentPlan,
  ConceptGraphId,
  CourseCreateService,
  CourseId,
  DanglingRefsReport,
  DocumentId,
  DocumentScopesService,
  DraftCourseState,
  DraftEditOp,
  DraftId,
  DraftStreamEvent,
  DraftStreamListener,
  DraftSummary,
  Engine,
  LessonDetail,
  LessonId,
  LessonsInUnit,
  Logger,
  Reference,
  SessionId,
  StrategyId,
  StudentId,
  ThresholdConfig,
  Timestamp,
  UnitListEntry,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import { type ConfirmDraftDeps, runConfirmDraft } from "./course-create/draft-confirmer.js";
import { applyEdit, buildSummary } from "./course-create/draft-mutations.js";
import {
  addConceptMutation,
  addEdgeMutation,
  addLessonAssessmentMutation,
  addLessonMutation,
  addUnitMutation,
  removeConceptMutation,
  removeLessonMutation,
  setAssessmentPlanMutation,
  setMetadataMutation,
} from "./course-create/draft-mutators.js";
import {
  getLessonDetailQuery,
  listDanglingRefsQuery,
  listLessonsInUnitQuery,
  listUnitsQuery,
} from "./course-create/draft-queries.js";
import { type Issue, validateProposed } from "./course-create/draft-validator.js";
import { createCourseFromPack as createCourseFromPackFn } from "./course-create/pack-course-creator.js";
import { notifyListeners } from "./db-helpers.js";
import { type DraftStore, SqliteDraftStore } from "./draft-store.js";

export type { Issue };

/** Drafts not touched in 7 days are swept as stale. */
export const DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface CourseCreateServiceDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves to the user's currently selected engine. Same pattern as visionResolver. */
  engineResolver: () => Engine;
  /** Phase 16: polymorphic scope ↔ document attachment — used by confirmDraft to attach source docs. */
  documentScopes: DocumentScopesService;
  /** Sweep period for stale drafts. Defaults to 60 seconds. */
  sweepIntervalMs?: number;
  /** Test injection seam: supply a custom DraftStore instead of SqliteDraftStore. */
  draftStore?: DraftStore;
}

/**
 * CourseCreateServiceImpl — owns draft lifecycle and the `confirmDraft`
 * transactional persist.
 *
 * Drafts are durable: they survive process restarts via SqliteDraftStore.
 * Drafts not touched in 7 days (DRAFT_STALE_MS) are swept as stale.
 *
 * This class is mode-agnostic — it does not know whether the caller is in
 * course-create mode or configure mode. Methods accept inputs, return outputs.
 *
 * All mutation logic is delegated to `course-create/draft-mutators.ts`,
 * query logic to `course-create/draft-queries.ts`, confirm logic to
 * `course-create/draft-confirmer.ts`, and pack creation to
 * `course-create/pack-course-creator.ts`. The service is a thin facade
 * responsible only for draft lifecycle (load, touch, save, emit).
 */
export class CourseCreateServiceImpl implements CourseCreateService {
  private readonly store: DraftStore;
  /**
   * Live subscribers (e.g. the course-create-drafts IPC channel forwarding to the
   * renderer's right-pane outline). Each receives a `snapshot` event on
   * subscribe, then `started` / `updated` / `finalized` / `discarded` per
   * mutation. Listener exceptions are logged but do not stop other listeners.
   */
  private readonly listeners = new Set<DraftStreamListener>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: CourseCreateServiceDeps) {
    this.store = deps.draftStore ?? new SqliteDraftStore(deps.db);
    const period = deps.sweepIntervalMs ?? 60_000;
    this.sweepTimer = setInterval(() => {
      this.sweepStale();
    }, period);
    // unref so this timer doesn't keep the process alive.
    this.sweepTimer.unref?.();
  }

  /**
   * Subscribe to draft-stream events. Sends a `snapshot` of currently-live
   * drafts immediately. Returns an unsubscribe function.
   */
  subscribe(listener: DraftStreamListener): () => void {
    listener({ kind: "snapshot", drafts: this.list() });
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Snapshot of currently-active drafts (not confirmed, not discarded). */
  list(): readonly DraftCourseState[] {
    return this.store.listActive();
  }

  /** Active drafts for a specific student, ordered by lastTouchedAt DESC. */
  listActiveForStudent(studentId: StudentId): readonly DraftCourseState[] {
    return this.store.listForStudent(studentId);
  }

  private emit(event: DraftStreamEvent): void {
    // Debug-level visibility into the draft stream. Lets us verify from logs
    // that the service is firing events even when the renderer isn't visibly
    // updating — pairs with `course-create.drafts.forward` in the IPC channel
    // so the chain service -> IPC -> renderer is end-to-end traceable.
    this.deps.log.debug("course-create.draft_stream.emit", {
      eventKind: event.kind,
      listenerCount: this.listeners.size,
      ...(event.kind === "snapshot" && { draftCount: event.drafts.length }),
      ...(event.kind === "started" && { draftId: event.draft.draftId }),
      ...(event.kind === "updated" && {
        draftId: event.draft.draftId,
        conceptCount: event.draft.proposed.proposedConcepts.length,
        lessonCount: event.draft.proposed.proposedLessons.length,
        unitCount: (event.draft.proposed.proposedUnits ?? []).length,
      }),
      ...(event.kind === "finalized" && {
        draftId: event.draftId,
        courseId: event.courseId,
      }),
      ...(event.kind === "discarded" && {
        draftId: event.draftId,
        reason: event.reason,
      }),
    });
    notifyListeners(this.listeners, event, this.deps.log, "course-create");
  }

  /**
   * Persist the mutated draft (with `lastTouchedAt` already bumped by the
   * caller) and emit an `updated` event so subscribers see the new state.
   * Used by every incremental mutator.
   */
  private saveAndEmitUpdate(d: DraftCourseState): void {
    this.store.save(d);
    this.emit({ kind: "updated", draft: d });
  }

  /**
   * Phase 16: create a new draft up-front (before the drafter has any concepts
   * to add). Used by the drafter's draft_init tool.
   *
   * `sessionId` is the PARENT course-create session id (S1 — the tutor session that
   * invoked start_drafting). It is stored on the draft so that confirmDraft
   * can promote session-scope document rows to course-scope. Pass
   * `ctx.parentSessionId ?? ctx.sessionId` from the calling tool handler.
   */
  async initDraft(input: {
    studentId: StudentId;
    sessionId?: SessionId;
    documentIds: DocumentId[];
    courseTitle: string;
    subject: string;
    gradeLevel: string;
  }): Promise<{ draftId: string }> {
    const now = Date.now() as Timestamp;
    const draft: DraftCourseState = {
      draftId: uuidv7(),
      studentId: input.studentId,
      documentIds: input.documentIds,
      proposed: {
        title: input.courseTitle,
        subject: input.subject,
        gradeLevel: input.gradeLevel,
        thresholds: {
          conceptMastery: 0.7,
          examPass: 0.7,
          allowRetake: true,
          decayDays: 14,
        },
        proposedConcepts: [],
        proposedEdges: [],
        proposedLessons: [],
        proposedUnits: [],
        proposedLessonAssessments: [],
      },
      createdAt: now,
      lastTouchedAt: now,
      expiresAt: (now + DRAFT_STALE_MS) as Timestamp,
      ...(input.sessionId !== undefined && { sessionId: input.sessionId }),
    };
    this.store.save(draft);
    this.emit({ kind: "started", draft });
    return { draftId: draft.draftId };
  }

  /**
   * Phase 16: incremental concept addition. Validates uniqueness (case-insensitive)
   * and rejects duplicates. Returns ok:false as data so the model can react.
   */
  async addConcept(input: {
    draftId: string;
    name: string;
    description: string;
  }): Promise<{ ok: true; conceptCount: number } | { ok: false; reason: string }> {
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const result = addConceptMutation(d, { name: input.name, description: input.description });
    if (!result.ok) return result;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true, conceptCount: result.conceptCount };
  }

  /** Phase 16: remove a concept (and all edges + lesson references to it). */
  async removeConcept(input: {
    draftId: string;
    name: string;
  }): Promise<{ ok: boolean; reason?: string }> {
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const result = removeConceptMutation(d, { name: input.name });
    if (!result.ok) return result;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true };
  }

  /** Phase 16: add a prerequisite edge between two existing concepts. */
  async addEdge(input: {
    draftId: string;
    fromName: string;
    toName: string;
    strength: number;
    rationale: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const result = addEdgeMutation(d, {
      fromName: input.fromName,
      toName: input.toName,
      strength: input.strength,
      rationale: input.rationale,
    });
    if (!result.ok) return result;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true };
  }

  /** Phase 16: add a lesson. All conceptNames must reference existing concepts. */
  async addLesson(input: {
    draftId: string;
    title: string;
    conceptNames: string[];
    references: ReadonlyArray<Reference>;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
  }): Promise<{ ok: true; lessonIndex: number } | { ok: false; reason: string }> {
    const { draftId: _lessonDraftId, ...lessonInput } = input;
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const result = addLessonMutation(d, lessonInput);
    if (!result.ok) return result;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true, lessonIndex: result.lessonIndex };
  }

  /** Phase 16: remove a lesson by index. */
  async removeLesson(input: {
    draftId: string;
    lessonIndex: number;
  }): Promise<{ ok: boolean; reason?: string }> {
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const result = removeLessonMutation(d, { lessonIndex: input.lessonIndex });
    if (!result.ok) return result;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true };
  }

  // ── Phase 16: unit + assessment scaffold ──────────────────────────────────────

  /** Phase 16: group draft lessons into a named unit. */
  async addUnit(input: {
    draftId: string;
    name: string;
    summary?: string;
    draftLessonIds: string[];
    summative?: {
      kind: "quiz" | "homework" | "exam";
      title: string;
      conceptNames: string[];
      expectedItemCount?: number;
      rationale: string;
    };
  }): Promise<{ ok: true; draftUnitId: string } | { ok: false; reason: string }> {
    const { draftId: _unitDraftId, ...unitInput } = input;
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const result = addUnitMutation(d, unitInput);
    if (!result.ok) return result;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true, draftUnitId: result.draftUnitId };
  }

  /** Phase 16: set the overall assessment scaffold plan. */
  async setAssessmentPlan(input: {
    draftId: string;
    plan: AssessmentPlan;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const result = setAssessmentPlanMutation(d, { plan: input.plan });
    if (!result.ok) return result;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true };
  }

  /** Phase 16: schedule an assessment attached to a specific lesson. */
  async addLessonAssessment(input: {
    draftId: string;
    draftLessonId: string;
    kind: "quiz" | "homework" | "exam";
    timing: "before" | "after" | "interleaved";
    purpose: "readiness" | "practice" | "checkpoint";
    conceptNames: string[];
    expectedItemCount?: number;
    rationale: string;
    title: string;
  }): Promise<{ ok: true; draftAssessmentId: string } | { ok: false; reason: string }> {
    const { draftId: _assessmentDraftId, ...assessmentInput } = input;
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const result = addLessonAssessmentMutation(d, assessmentInput);
    if (!result.ok) return result;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true, draftAssessmentId: result.draftAssessmentId };
  }

  /** Phase 16: update draft title/subject/gradeLevel/thresholds. */
  async setMetadata(input: {
    draftId: string;
    title?: string;
    subject?: string;
    gradeLevel?: string;
    thresholds?: Partial<ThresholdConfig>;
  }): Promise<{ ok: boolean; reason?: string }> {
    const { draftId: _metaDraftId, ...metaInput } = input;
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const result = setMetadataMutation(d, metaInput);
    if (!result.ok) return result;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true };
  }

  /**
   * Build a compact summary of the live draft. Returns null if the draft is
   * gone (expired or never existed). Used by the drafter to surface partial
   * progress to the tutor without forcing a "finalize" ritual, and by the
   * tutor's UI to render quick metrics.
   */
  async summarize(draftId: string): Promise<DraftSummary | null> {
    const d = await this.showDraft(draftId);
    if (!d) return null;
    return buildSummary(d);
  }

  async showDraft(draftId: string): Promise<DraftCourseState | null> {
    const d = this.store.load(brandId<"DraftId">(draftId) as DraftId);
    if (!d) return null;
    // Column-only bump — no blob re-serialization needed for a read.
    this.store.touch(brandId<"DraftId">(draftId) as DraftId);
    return d;
  }

  async editDraft(input: {
    draftId: string;
    op: DraftEditOp;
  }): Promise<{ draft: DraftCourseState; warnings: readonly string[] }> {
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) throw new Error(`Draft not found or expired: ${input.draftId}`);
    const result = applyEdit(d.proposed, input.op);
    d.proposed = result.state;
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { draft: d, warnings: result.warnings };
  }

  /**
   * Validate and persist the draft as a real course. Validation issues are
   * returned as data (`{ ok: false, issues }`) so the tutor can surface them to
   * the student and the drafter can fix and retry without a separate
   * "finalize" ritual.
   *
   * Throws only on lifecycle errors (draft expired, owner mismatch) — those are
   * not data issues the model can fix, so they don't fit the discriminated
   * union shape.
   */
  async confirmDraft(input: {
    draftId: string;
    studentId: StudentId;
  }): Promise<
    | { ok: true; courseId: CourseId; lessonIds: LessonId[]; conceptGraphId: string }
    | { ok: false; issues: ReadonlyArray<Issue> }
  > {
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) throw new Error(`Draft not found or expired: ${input.draftId}`);
    if (d.studentId !== input.studentId) {
      throw new Error(`Draft owner mismatch: draft belongs to a different student`);
    }

    const issues = validateProposed(d.proposed);
    if (issues.length > 0) return { ok: false, issues };

    const confirmDeps: ConfirmDraftDeps = {
      db: this.deps.db,
      documentScopes: this.deps.documentScopes,
      log: this.deps.log,
    };

    const result = await runConfirmDraft(
      {
        draft: d,
        markConfirmedTx: (tx, draftId, courseId) =>
          this.store.markConfirmedTx(tx, draftId, courseId),
      },
      confirmDeps,
    );

    this.emit({
      kind: "finalized",
      draftId: brandId<"DraftId">(input.draftId) as DraftId,
      courseId: result.courseId,
    });
    return {
      ok: true,
      courseId: result.courseId,
      lessonIds: result.lessonIds,
      conceptGraphId: result.conceptGraphId,
    };
  }

  async discardDraft(draftId: string): Promise<void> {
    const d = this.store.load(brandId<"DraftId">(draftId) as DraftId);
    if (d) {
      this.store.markDiscarded(brandId<"DraftId">(draftId) as DraftId);
      this.emit({
        kind: "discarded",
        draftId: brandId<"DraftId">(draftId) as DraftId,
        reason: "discarded",
      });
    }
  }

  /**
   * Phase 10: Create a course directly from an imported canonical pack.
   * Reads concepts from the already-imported conceptGraphId, groups them into
   * lessons (one per 5-8 sequential concepts in pack order), and inserts a
   * course + lessons + skeleton gates in a single transaction.
   */
  async createCourseFromPack(input: {
    studentId: StudentId;
    packId: string;
    conceptGraphId: ConceptGraphId;
    courseTitle: string;
    gradeLevel: string;
  }): Promise<{ courseId: string; conceptCount: number }> {
    return createCourseFromPackFn(input, this.deps.db);
  }

  // ── Chunked-query methods (expressive-draft-api) ─────────────────────────

  async listUnits(draftId: string): Promise<UnitListEntry[] | null> {
    const d = this.store.load(brandId<"DraftId">(draftId) as DraftId);
    if (!d) return null;
    return listUnitsQuery(d.proposed);
  }

  async listLessonsInUnit(input: {
    draftId: string;
    draftUnitId: string;
  }): Promise<LessonsInUnit | null> {
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return null;
    return listLessonsInUnitQuery(d.proposed, input.draftUnitId);
  }

  async getLessonDetail(input: {
    draftId: string;
    draftLessonId: string;
  }): Promise<LessonDetail | null> {
    const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
    if (!d) return null;
    return getLessonDetailQuery(d.proposed, input.draftLessonId);
  }

  async listDanglingRefs(draftId: string): Promise<DanglingRefsReport | null> {
    const d = this.store.load(brandId<"DraftId">(draftId) as DraftId);
    if (!d) return null;
    return listDanglingRefsQuery(d.proposed);
  }

  /** Test/observability handle: count active (non-confirmed, non-discarded) drafts. */
  size(): number {
    return this.store.listActive().length;
  }

  /**
   * Cleanup helper for host shutdown.
   * Clears the sweep timer and in-process listeners ONLY — draft rows survive
   * in the DB so they can be resumed after restart.
   */
  shutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    // Drop listeners — prevents leaks from forgotten subscribers.
    this.listeners.clear();
  }

  private sweepStale(): void {
    const cutoff = Date.now() - DRAFT_STALE_MS;
    const sweptIds = this.store.sweepStale(cutoff);
    for (const id of sweptIds) {
      this.emit({ kind: "discarded", draftId: id, reason: "expired" });
    }
  }
}
