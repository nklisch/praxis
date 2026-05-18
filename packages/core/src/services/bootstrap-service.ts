import {
  assignments,
  courses,
  courseUnits,
  gates,
  lessonAssessments,
  lessons,
  lessonUnits,
} from "@praxis/artifacts/schema";
import { conceptGraphs, concepts, prerequisiteEdges } from "@praxis/curriculum/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  AssessmentPlan,
  BootstrapService,
  ConceptGraphId,
  CourseId,
  DanglingRefsReport,
  DocumentId,
  DocumentScopesService,
  DraftCourseState,
  DraftEditOp,
  DraftStreamEvent,
  DraftStreamListener,
  DraftSummary,
  Engine,
  LessonDetail,
  LessonId,
  LessonsInUnit,
  Logger,
  ProposedCourse,
  ProposedUnit,
  Reference,
  SessionId,
  StrategyId,
  StudentId,
  ThresholdConfig,
  Timestamp,
  UnitListEntry,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import { type DraftStore, SqliteDraftStore } from "./draft-store.js";

export interface Issue {
  kind: string;
  message: string;
}

/** Drafts not touched in 7 days are swept as stale. */
export const DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface BootstrapServiceDeps {
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
 * BootstrapServiceImpl — owns draft lifecycle and the `confirmDraft`
 * transactional persist.
 *
 * Drafts are durable: they survive process restarts via SqliteDraftStore.
 * Drafts not touched in 7 days (DRAFT_STALE_MS) are swept as stale.
 *
 * This class is mode-agnostic — it does not know whether the caller is in
 * bootstrap mode or configure mode. Methods accept inputs, return outputs.
 */
export class BootstrapServiceImpl implements BootstrapService {
  private readonly store: DraftStore;
  /**
   * Live subscribers (e.g. the bootstrap-drafts IPC channel forwarding to the
   * renderer's right-pane outline). Each receives a `snapshot` event on
   * subscribe, then `started` / `updated` / `finalized` / `discarded` per
   * mutation. Listener exceptions are logged but do not stop other listeners.
   */
  private readonly listeners = new Set<DraftStreamListener>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: BootstrapServiceDeps) {
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
    // updating — pairs with `bootstrap.drafts.forward` in the IPC channel
    // so the chain service -> IPC -> renderer is end-to-end traceable.
    this.deps.log.debug("bootstrap.draft_stream.emit", {
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
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.deps.log.warn("bootstrap.draft_listener_threw", { err: String(err) });
      }
    }
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
   * Phase 16: create a new draft up-front (before the explorer has any concepts
   * to add). Used by the explorer's draft_init tool.
   *
   * `sessionId` is the PARENT bootstrap session id (S1 — the tutor session that
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
    const d = this.store.load(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const lower = input.name.trim().toLowerCase();
    if (d.proposed.proposedConcepts.some((c) => c.name.trim().toLowerCase() === lower)) {
      return { ok: false, reason: `concept "${input.name}" already exists` };
    }
    d.proposed.proposedConcepts.push({
      name: input.name.trim(),
      description: input.description.trim(),
      evidence: [],
    });
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true, conceptCount: d.proposed.proposedConcepts.length };
  }

  /** Phase 16: remove a concept (and all edges + lesson references to it). */
  async removeConcept(input: {
    draftId: string;
    name: string;
  }): Promise<{ ok: boolean; reason?: string }> {
    const d = this.store.load(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const lower = input.name.trim().toLowerCase();
    const before = d.proposed.proposedConcepts.length;
    d.proposed.proposedConcepts = d.proposed.proposedConcepts.filter(
      (c) => c.name.trim().toLowerCase() !== lower,
    );
    if (d.proposed.proposedConcepts.length === before) {
      return { ok: false, reason: `concept "${input.name}" not found` };
    }
    // Remove edges referencing this concept.
    d.proposed.proposedEdges = d.proposed.proposedEdges.filter(
      (e) => e.fromName.trim().toLowerCase() !== lower && e.toName.trim().toLowerCase() !== lower,
    );
    // Remove concept from lessons.
    d.proposed.proposedLessons = d.proposed.proposedLessons.map((l) => ({
      ...l,
      conceptNames: l.conceptNames.filter((n) => n.trim().toLowerCase() !== lower),
    }));
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
    const d = this.store.load(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const known = new Set(d.proposed.proposedConcepts.map((c) => c.name.trim().toLowerCase()));
    const fromLower = input.fromName.trim().toLowerCase();
    const toLower = input.toName.trim().toLowerCase();
    if (!known.has(fromLower))
      return { ok: false, reason: `concept "${input.fromName}" not found` };
    if (!known.has(toLower)) return { ok: false, reason: `concept "${input.toName}" not found` };
    if (fromLower === toLower) return { ok: false, reason: "self-edges are not allowed" };
    // Check duplicate edge.
    const exists = d.proposed.proposedEdges.some(
      (e) =>
        e.fromName.trim().toLowerCase() === fromLower && e.toName.trim().toLowerCase() === toLower,
    );
    if (exists) return { ok: false, reason: "edge already exists" };
    d.proposed.proposedEdges.push({
      fromName: input.fromName.trim(),
      toName: input.toName.trim(),
      strength: Math.max(0, Math.min(1, input.strength)),
      rationale: input.rationale.trim(),
    });
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
    const d = this.store.load(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const known = new Set(d.proposed.proposedConcepts.map((c) => c.name.trim().toLowerCase()));
    for (const cn of input.conceptNames) {
      if (!known.has(cn.trim().toLowerCase())) {
        return { ok: false, reason: `concept "${cn}" not found — add it first` };
      }
    }
    const newLesson = {
      draftLessonId: `lesson-${uuidv7()}`,
      title: input.title.trim(),
      conceptNames: input.conceptNames.map((n) => n.trim()),
      references: input.references as Reference[],
      suggestedStrategy: input.suggestedStrategy ?? brandId<"StrategyId">("worked-examples"),
      estimatedMinutes: input.estimatedMinutes ?? 45,
    };
    d.proposed.proposedLessons.push(newLesson);
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true, lessonIndex: d.proposed.proposedLessons.length - 1 };
  }

  /** Phase 16: remove a lesson by index. */
  async removeLesson(input: {
    draftId: string;
    lessonIndex: number;
  }): Promise<{ ok: boolean; reason?: string }> {
    const d = this.store.load(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    if (input.lessonIndex < 0 || input.lessonIndex >= d.proposed.proposedLessons.length) {
      return { ok: false, reason: `lesson index ${input.lessonIndex} out of bounds` };
    }
    d.proposed.proposedLessons.splice(input.lessonIndex, 1);
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
    const d = this.store.load(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const knownLessons = new Set(d.proposed.proposedLessons.map((l) => l.draftLessonId));
    for (const id of input.draftLessonIds) {
      if (!knownLessons.has(id)) {
        return { ok: false, reason: `lesson "${id}" not found in draft — add it first` };
      }
    }
    if (input.summative) {
      const knownConcepts = new Set(
        d.proposed.proposedConcepts.map((c) => c.name.trim().toLowerCase()),
      );
      for (const cn of input.summative.conceptNames) {
        if (!knownConcepts.has(cn.trim().toLowerCase())) {
          return {
            ok: false,
            reason: `summative references unknown concept "${cn}" — add it first`,
          };
        }
      }
    }
    const draftUnitId = uuidv7();
    const unit: ProposedUnit = {
      draftUnitId,
      name: input.name.trim(),
      ...(input.summary !== undefined && { summary: input.summary.trim() }),
      draftLessonIds: input.draftLessonIds,
      ...(input.summative !== undefined && {
        summative: {
          draftAssessmentId: uuidv7(),
          kind: input.summative.kind,
          title: input.summative.title.trim(),
          conceptNames: input.summative.conceptNames,
          ...(input.summative.expectedItemCount !== undefined && {
            expectedItemCount: input.summative.expectedItemCount,
          }),
          rationale: input.summative.rationale.trim(),
        },
      }),
    };
    if (!d.proposed.proposedUnits) d.proposed.proposedUnits = [];
    d.proposed.proposedUnits.push(unit);
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true, draftUnitId };
  }

  /** Phase 16: set the overall assessment scaffold plan. */
  async setAssessmentPlan(input: {
    draftId: string;
    plan: AssessmentPlan;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const d = this.store.load(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    d.proposed.assessmentPlan = input.plan;
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
    const d = this.store.load(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    const knownLessons = new Set(d.proposed.proposedLessons.map((l) => l.draftLessonId));
    if (!knownLessons.has(input.draftLessonId)) {
      return {
        ok: false,
        reason: `lesson "${input.draftLessonId}" not found in draft — add it first`,
      };
    }
    const knownConcepts = new Set(
      d.proposed.proposedConcepts.map((c) => c.name.trim().toLowerCase()),
    );
    for (const cn of input.conceptNames) {
      if (!knownConcepts.has(cn.trim().toLowerCase())) {
        return { ok: false, reason: `concept "${cn}" not found in draft — add it first` };
      }
    }
    const draftAssessmentId = uuidv7();
    if (!d.proposed.proposedLessonAssessments) d.proposed.proposedLessonAssessments = [];
    d.proposed.proposedLessonAssessments.push({
      draftAssessmentId,
      draftLessonId: input.draftLessonId,
      kind: input.kind,
      timing: input.timing,
      purpose: input.purpose,
      title: input.title.trim(),
      conceptNames: input.conceptNames,
      ...(input.expectedItemCount !== undefined && {
        expectedItemCount: input.expectedItemCount,
      }),
      rationale: input.rationale.trim(),
    });
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true, draftAssessmentId };
  }

  /** Phase 16: update draft title/subject/gradeLevel/thresholds. */
  async setMetadata(input: {
    draftId: string;
    title?: string;
    subject?: string;
    gradeLevel?: string;
    thresholds?: Partial<ThresholdConfig>;
  }): Promise<{ ok: boolean; reason?: string }> {
    const d = this.store.load(input.draftId);
    if (!d) return { ok: false, reason: "draft not found or expired" };
    if (input.title !== undefined) d.proposed.title = input.title.trim();
    if (input.subject !== undefined) d.proposed.subject = input.subject.trim();
    if (input.gradeLevel !== undefined) d.proposed.gradeLevel = input.gradeLevel.trim();
    if (input.thresholds !== undefined) {
      d.proposed.thresholds = { ...d.proposed.thresholds, ...input.thresholds };
    }
    d.lastTouchedAt = Date.now() as Timestamp;
    this.saveAndEmitUpdate(d);
    return { ok: true };
  }

  /**
   * Build a compact summary of the live draft. Returns null if the draft is
   * gone (expired or never existed). Used by the explorer to surface partial
   * progress to the tutor without forcing a "finalize" ritual, and by the
   * tutor's UI to render quick metrics.
   */
  async summarize(draftId: string): Promise<DraftSummary | null> {
    const d = await this.showDraft(draftId);
    if (!d) return null;
    return buildSummary(d);
  }

  async showDraft(draftId: string): Promise<DraftCourseState | null> {
    const d = this.store.load(draftId);
    if (!d) return null;
    // Column-only bump — no blob re-serialization needed for a read.
    this.store.touch(draftId);
    return d;
  }

  async editDraft(input: {
    draftId: string;
    op: DraftEditOp;
  }): Promise<{ draft: DraftCourseState; warnings: readonly string[] }> {
    const d = this.store.load(input.draftId);
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
   * the student and the explore agent can fix and retry without a separate
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
    const d = this.store.load(input.draftId);
    if (!d) throw new Error(`Draft not found or expired: ${input.draftId}`);
    if (d.studentId !== input.studentId) {
      throw new Error(`Draft owner mismatch: draft belongs to a different student`);
    }

    const issues = validateProposed(d.proposed);
    if (issues.length > 0) return { ok: false, issues };

    const now = new Date();
    // confirmDraft is atomic: persistDraftTx and markConfirmedTx run in the
    // same Drizzle transaction. If the persist fails, the draft row stays active.
    const result = this.deps.db.transaction((tx) => {
      const r = persistDraftTx({ tx, draft: d, now });
      this.store.markConfirmedTx(tx, input.draftId, r.courseId);
      return r;
    });

    // Phase 16: attach source documents to the new course.
    // When the draft carries a sessionId (bootstrap-session-scoped-attachment
    // feature), promote the session-scope rows to course-scope — both survive so
    // the audit trail of "which docs this bootstrap session pulled in" is
    // preserved. For legacy drafts without sessionId, fall back to the original
    // attachMany path.
    if (d.sessionId !== undefined) {
      try {
        await this.deps.documentScopes.promoteScope({
          from: { kind: "session", id: d.sessionId },
          to: { kind: "course", id: result.courseId },
          source: "bootstrap",
        });
      } catch (err) {
        this.deps.log.warn("confirmDraft.promoteScope_failed", {
          courseId: result.courseId,
          sessionId: d.sessionId,
          err: String(err),
        });
        // Non-fatal — course is persisted; documents can be manually re-attached.
      }
    } else if (d.documentIds.length > 0) {
      // Legacy path: draft predates session-scoped attachment; attach directly.
      try {
        await this.deps.documentScopes.attachMany({
          scope: { kind: "course", id: result.courseId },
          documentIds: d.documentIds,
          source: "bootstrap",
        });
      } catch (err) {
        this.deps.log.warn("confirmDraft.attachMany_failed", {
          courseId: result.courseId,
          err: String(err),
        });
        // Non-fatal: course is persisted; user can manually attach.
      }
    }

    this.emit({ kind: "finalized", draftId: input.draftId, courseId: result.courseId });
    return {
      ok: true,
      courseId: result.courseId,
      lessonIds: result.lessonIds,
      conceptGraphId: result.conceptGraphId,
    };
  }

  async discardDraft(draftId: string): Promise<void> {
    const d = this.store.load(draftId);
    if (d) {
      this.store.markDiscarded(draftId);
      this.emit({ kind: "discarded", draftId, reason: "discarded" });
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
    // Read all concepts for the given graph in order (ordered by id — pack order preserved
    // via lexicographic concept ids which encode pack sequence).
    const conceptRows = this.deps.db
      .select()
      .from(concepts)
      .where(eq(concepts.graphId, input.conceptGraphId))
      .all();

    if (conceptRows.length === 0) {
      throw new Error(
        `cannot create course from pack: no concepts found for conceptGraphId '${input.conceptGraphId}'. Has pack '${input.packId}' been imported?`,
      );
    }

    const now = new Date();
    const LESSON_SIZE = 7; // target ~7 concepts per lesson (5-8 range)

    const result = this.deps.db.transaction((tx) => {
      // 1. Course row.
      const courseId = uuidv7();
      tx.insert(courses)
        .values({
          id: courseId,
          studentId: input.studentId,
          title: input.courseTitle,
          subject: input.packId, // pack id used as subject key
          gradeLevel: input.gradeLevel,
          sourceJson: { kind: "canonical_pack", packId: input.packId },
          conceptGraphId: input.conceptGraphId,
          thresholdsJson: {
            conceptMastery: 0.8,
            lessonMastery: 0.75,
            decayDays: 14,
          },
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // 2. Group concepts into lessons (flat sequential grouping).
      const groups: (typeof conceptRows)[] = [];
      for (let i = 0; i < conceptRows.length; i += LESSON_SIZE) {
        groups.push(conceptRows.slice(i, i + LESSON_SIZE));
      }

      const lessonRowValues = groups.map((group, i) => {
        const firstConcept = group[0];
        return {
          id: uuidv7(),
          courseId,
          title: firstConcept ? `Lesson ${i + 1}: ${firstConcept.name}` : `Lesson ${i + 1}`,
          orderIndex: i,
          conceptIdsJson: group.map((c) => c.id),
          referencesJson: [] as string[],
          suggestedStrategy: brandId<"StrategyId">("worked-examples"),
          estimatedMinutes: group.length * 10,
        };
      });

      if (lessonRowValues.length > 0) {
        tx.insert(lessons).values(lessonRowValues).run();
      }

      // 3. Skeleton gates — one per lesson, chained.
      const gateIds = lessonRowValues.map(() => uuidv7());
      const gateRowValues = lessonRowValues.map((l, i) => ({
        // biome-ignore lint/style/noNonNullAssertion: gateIds is same-length as lessonRowValues
        id: gateIds[i]!,
        courseId,
        guardsJson: { kind: "lesson", lessonId: l.id },
        // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
        prerequisitesJson: i > 0 ? [gateIds[i - 1]!] : [],
        successCriteriaJson: {
          kind: "mastery-threshold",
          conceptIds: l.conceptIdsJson,
          minScore: 0.8,
        },
        stateJson: {
          kind: "locked",
          // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
          missingPrerequisites: i > 0 ? [gateIds[i - 1]!] : [],
        },
        evidenceJson: [],
      }));

      if (gateRowValues.length > 0) {
        tx.insert(gates).values(gateRowValues).run();
      }

      return { courseId, conceptCount: conceptRows.length };
    });

    return {
      courseId: result.courseId,
      conceptCount: result.conceptCount,
    };
  }

  // ── Chunked-query methods (expressive-draft-api) ─────────────────────────

  async listUnits(draftId: string): Promise<UnitListEntry[] | null> {
    const d = this.store.load(draftId);
    if (!d) return null;
    const p = d.proposed;
    return (p.proposedUnits ?? []).map((u) => ({
      draftUnitId: u.draftUnitId,
      name: u.name,
      ...(u.summary !== undefined && { summary: u.summary }),
      lessonCount: u.draftLessonIds.length,
      hasSummative: u.summative !== undefined,
    }));
  }

  async listLessonsInUnit(input: {
    draftId: string;
    draftUnitId: string;
  }): Promise<LessonsInUnit | null> {
    const d = this.store.load(input.draftId);
    if (!d) return null;
    const p = d.proposed;
    const unit = (p.proposedUnits ?? []).find((u) => u.draftUnitId === input.draftUnitId);
    if (!unit) return null;

    // Count assessments per lesson from proposedLessonAssessments.
    const assessmentsByLesson = new Map<string, number>();
    for (const la of p.proposedLessonAssessments ?? []) {
      assessmentsByLesson.set(
        la.draftLessonId,
        (assessmentsByLesson.get(la.draftLessonId) ?? 0) + 1,
      );
    }

    const lessonMap = new Map(p.proposedLessons.map((l) => [l.draftLessonId, l]));
    const lessons = unit.draftLessonIds.flatMap((id) => {
      const lesson = lessonMap.get(id);
      if (!lesson) return [];
      return [
        {
          draftLessonId: lesson.draftLessonId,
          title: lesson.title,
          conceptCount: lesson.conceptNames.length,
          assessmentCount: assessmentsByLesson.get(id) ?? 0,
        },
      ];
    });

    return {
      draftUnitId: unit.draftUnitId,
      unitName: unit.name,
      lessons,
    };
  }

  async getLessonDetail(input: {
    draftId: string;
    draftLessonId: string;
  }): Promise<LessonDetail | null> {
    const d = this.store.load(input.draftId);
    if (!d) return null;
    const p = d.proposed;

    const lesson = p.proposedLessons.find((l) => l.draftLessonId === input.draftLessonId);
    if (!lesson) return null;

    const assessments = (p.proposedLessonAssessments ?? [])
      .filter((la) => la.draftLessonId === input.draftLessonId)
      .map((la) => ({
        draftAssessmentId: la.draftAssessmentId,
        kind: la.kind,
        timing: la.timing,
        purpose: la.purpose,
        title: la.title,
      }));

    const parentUnit =
      (p.proposedUnits ?? []).find((u) => u.draftLessonIds.includes(input.draftLessonId)) ?? null;

    return {
      draftLessonId: lesson.draftLessonId,
      title: lesson.title,
      conceptNames: lesson.conceptNames,
      assessments,
      parentUnit: parentUnit
        ? { draftUnitId: parentUnit.draftUnitId, name: parentUnit.name }
        : null,
    };
  }

  async listDanglingRefs(draftId: string): Promise<DanglingRefsReport | null> {
    const d = this.store.load(draftId);
    if (!d) return null;
    const p = d.proposed;

    // Orphan concepts: in proposedConcepts but referenced by zero lessons.
    const conceptsInLessons = new Set<string>();
    for (const lesson of p.proposedLessons) {
      for (const cn of lesson.conceptNames) conceptsInLessons.add(cn);
    }
    const orphanConcepts = p.proposedConcepts
      .filter((c) => !conceptsInLessons.has(c.name))
      .map((c) => c.name);

    // Dangling unit memberships: unit's draftLessonIds not in proposedLessons.
    const knownLessonIds = new Set(p.proposedLessons.map((l) => l.draftLessonId));
    const danglingUnitMemberships = (p.proposedUnits ?? [])
      .map((u) => ({
        draftUnitId: u.draftUnitId,
        unitName: u.name,
        badLessonIds: u.draftLessonIds.filter((id) => !knownLessonIds.has(id)),
      }))
      .filter((u) => u.badLessonIds.length > 0);

    // Dangling lesson assessments.
    const danglingLessonAssessments = (p.proposedLessonAssessments ?? [])
      .filter((la) => !knownLessonIds.has(la.draftLessonId))
      .map((la) => ({
        draftAssessmentId: la.draftAssessmentId,
        badLessonId: la.draftLessonId,
      }));

    // Edges referencing unknown concepts.
    const knownConcepts = new Set(p.proposedConcepts.map((c) => c.name));
    const edgesReferencingUnknownConcepts = p.proposedEdges
      .filter((e) => !knownConcepts.has(e.fromName) || !knownConcepts.has(e.toName))
      .map((e) => ({ fromName: e.fromName, toName: e.toName }));

    return {
      orphanConcepts,
      danglingUnitMemberships,
      danglingLessonAssessments,
      edgesReferencingUnknownConcepts,
    };
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

// ── Pure helpers ──────────────────────────────────────────────────────────────

function buildSummary(d: DraftCourseState): DraftSummary {
  const p = d.proposed;
  const units = p.proposedUnits ?? [];
  const lessonAssessments = p.proposedLessonAssessments ?? [];
  // Count summatives from all units + per-lesson assessments.
  const summativeCount = units.filter((u) => u.summative !== undefined).length;
  return {
    draftId: d.draftId,
    title: p.title,
    lessonCount: p.proposedLessons.length,
    conceptCount: p.proposedConcepts.length,
    edgeCount: p.proposedEdges.length,
    firstLessons: p.proposedLessons.slice(0, 5).map((l) => ({
      title: l.title,
      conceptCount: l.conceptNames.length,
    })),
    unitCount: units.length,
    assessmentCount: summativeCount + lessonAssessments.length,
  };
}

function validateProposed(p: ProposedCourse): Issue[] {
  const issues: Issue[] = [];
  if (!p.title?.trim()) {
    issues.push({ kind: "empty_title", message: "course title is empty" });
  }
  if (p.proposedConcepts.length === 0) {
    issues.push({ kind: "no_concepts", message: "draft has no concepts" });
  }
  if (p.proposedLessons.length === 0) {
    issues.push({ kind: "no_lessons", message: "draft has no lessons" });
  }
  const known = new Set(p.proposedConcepts.map((c) => c.name));
  for (const lesson of p.proposedLessons) {
    for (const cn of lesson.conceptNames) {
      if (!known.has(cn)) {
        issues.push({
          kind: "unknown_concept_in_lesson",
          message: `lesson "${lesson.title}" references unknown concept "${cn}"`,
        });
      }
    }
  }
  for (const e of p.proposedEdges) {
    if (!known.has(e.fromName) || !known.has(e.toName)) {
      issues.push({
        kind: "unknown_concept_in_edge",
        message: `edge ${e.fromName}→${e.toName} references unknown concept`,
      });
    }
  }

  // Phase 16: validate units.
  const knownLessons = new Set(p.proposedLessons.map((l) => l.draftLessonId));
  const knownLower = new Set(p.proposedConcepts.map((c) => c.name.trim().toLowerCase()));
  for (const unit of p.proposedUnits ?? []) {
    for (const id of unit.draftLessonIds) {
      if (!knownLessons.has(id)) {
        issues.push({
          kind: "unit_unknown_lesson",
          message: `unit "${unit.name}" references unknown lesson id "${id}"`,
        });
      }
    }
    if (unit.summative) {
      for (const cn of unit.summative.conceptNames) {
        if (!knownLower.has(cn.trim().toLowerCase())) {
          issues.push({
            kind: "assessment_unknown_concept",
            message: `unit "${unit.name}" summative references unknown concept "${cn}"`,
          });
        }
      }
    }
  }

  // Phase 16: validate per-lesson assessments.
  for (const la of p.proposedLessonAssessments ?? []) {
    if (!knownLessons.has(la.draftLessonId)) {
      issues.push({
        kind: "unit_lesson_not_in_draft",
        message: `lesson assessment "${la.title}" references unknown lesson id "${la.draftLessonId}"`,
      });
    }
    for (const cn of la.conceptNames) {
      if (!knownLower.has(cn.trim().toLowerCase())) {
        issues.push({
          kind: "assessment_unknown_concept",
          message: `lesson assessment "${la.title}" references unknown concept "${cn}"`,
        });
      }
    }
  }

  return issues;
}

interface EditResult {
  state: ProposedCourse;
  warnings: readonly string[];
}

/** Convenience constructor for a result with no warnings. */
function ok(state: ProposedCourse): EditResult {
  return { state, warnings: [] };
}

/**
 * Apply a single edit operation to a ProposedCourse (pure function).
 * Returns `{ state, warnings }` — warnings are informational signals for the
 * model (e.g. "concept already exists"); they do not abort the operation.
 * Throws only on hard structural violations (index out of bounds, missing
 * endpoint for add-edge, etc.).
 *
 * Exhaustive switch — TypeScript will error if a new DraftEditOp variant is
 * added without adding a branch here.
 */
function applyEdit(p: ProposedCourse, op: DraftEditOp): EditResult {
  switch (op.kind) {
    case "rename-course":
      return ok({ ...p, title: op.title });

    case "rename-lesson": {
      const ls = [...p.proposedLessons];
      const target = ls[op.lessonIndex];
      if (!target) throw new Error(`Lesson index out of bounds: ${op.lessonIndex}`);
      ls[op.lessonIndex] = { ...target, title: op.title };
      return ok({ ...p, proposedLessons: ls });
    }

    case "reorder-lessons": {
      if (op.newOrder.length !== p.proposedLessons.length) {
        throw new Error(
          `reorder-lessons: newOrder length ${op.newOrder.length} !== lesson count ${p.proposedLessons.length}`,
        );
      }
      return ok({
        ...p,
        proposedLessons: op.newOrder.map((i) => {
          const l = p.proposedLessons[i];
          if (!l) throw new Error(`reorder-lessons: index ${i} out of bounds`);
          return l;
        }),
      });
    }

    case "remove-lesson": {
      const removed = p.proposedLessons[op.lessonIndex];
      if (!removed) throw new Error(`remove-lesson: lessonIndex ${op.lessonIndex} out of bounds`);
      const removedId = removed.draftLessonId;
      const removedTitle = removed.title;

      const ls = p.proposedLessons.filter((_, i) => i !== op.lessonIndex);

      // Cascade: remove the lesson id from every unit's draftLessonIds.
      let unitMembershipCount = 0;
      const units = (p.proposedUnits ?? []).map((u) => {
        const before = u.draftLessonIds.length;
        const filtered = u.draftLessonIds.filter((id) => id !== removedId);
        unitMembershipCount += before - filtered.length;
        return { ...u, draftLessonIds: filtered };
      });

      // Cascade: drop lesson assessments that belong to the removed lesson.
      const assessmentsBefore = p.proposedLessonAssessments ?? [];
      const assessmentsAfter = assessmentsBefore.filter((a) => a.draftLessonId !== removedId);
      const droppedAssessments = assessmentsBefore.length - assessmentsAfter.length;

      const warning =
        `removed lesson '${removedTitle}' (id ${removedId}); also dropped: ` +
        `${unitMembershipCount} unit-membership ref${unitMembershipCount !== 1 ? "s" : ""}, ` +
        `${droppedAssessments} lesson assessment${droppedAssessments !== 1 ? "s" : ""}`;

      return {
        state: {
          ...p,
          proposedLessons: ls,
          proposedUnits: units,
          proposedLessonAssessments: assessmentsAfter,
        },
        warnings: [warning],
      };
    }

    case "add-lesson": {
      const newLesson = {
        draftLessonId: `lesson-${Date.now()}`,
        title: op.title,
        conceptNames: op.conceptNames,
        references: [],
        suggestedStrategy: brandId<"StrategyId">("worked-examples"),
        estimatedMinutes: 45,
      };
      const ls = [...p.proposedLessons];
      ls.splice(op.afterIndex + 1, 0, newLesson);
      return ok({ ...p, proposedLessons: ls });
    }

    case "rename-concept": {
      // Update the concept list and all lesson conceptNames references.
      const cs = p.proposedConcepts.map((c) =>
        c.name === op.conceptName ? { ...c, name: op.newName } : c,
      );
      const ls = p.proposedLessons.map((l) => ({
        ...l,
        conceptNames: l.conceptNames.map((n) => (n === op.conceptName ? op.newName : n)),
      }));
      const es = p.proposedEdges.map((e) => ({
        ...e,
        fromName: e.fromName === op.conceptName ? op.newName : e.fromName,
        toName: e.toName === op.conceptName ? op.newName : e.toName,
      }));
      return ok({ ...p, proposedConcepts: cs, proposedLessons: ls, proposedEdges: es });
    }

    case "remove-concept": {
      const cs = p.proposedConcepts.filter((c) => c.name !== op.conceptName);
      const ls = p.proposedLessons.map((l) => ({
        ...l,
        conceptNames: l.conceptNames.filter((n) => n !== op.conceptName),
      }));
      const es = p.proposedEdges.filter(
        (e) => e.fromName !== op.conceptName && e.toName !== op.conceptName,
      );
      return ok({ ...p, proposedConcepts: cs, proposedLessons: ls, proposedEdges: es });
    }

    case "add-concept": {
      const known = new Set(p.proposedConcepts.map((c) => c.name));
      if (known.has(op.name)) {
        return {
          state: p,
          warnings: [
            `concept '${op.name}' already exists in the draft; no new concept was added. ` +
              `Use relink-concept if you want to associate it with lesson ${op.lessonIndex}.`,
          ],
        };
      }
      const newConcept = { name: op.name, description: op.description, evidence: [] };
      const cs = [...p.proposedConcepts, newConcept];
      const ls = [...p.proposedLessons];
      const lessonTarget = ls[op.lessonIndex];
      if (!lessonTarget)
        throw new Error(`add-concept: lessonIndex ${op.lessonIndex} out of bounds`);
      const names = [...lessonTarget.conceptNames];
      const insertAt = op.afterConceptIndex !== undefined ? op.afterConceptIndex + 1 : names.length;
      names.splice(insertAt, 0, op.name);
      ls[op.lessonIndex] = { ...lessonTarget, conceptNames: names };
      return ok({ ...p, proposedConcepts: cs, proposedLessons: ls });
    }

    case "set-thresholds":
      return ok({ ...p, thresholds: op.thresholds });

    case "relink-concept": {
      const known = new Set(p.proposedConcepts.map((c) => c.name));
      if (!known.has(op.conceptName)) {
        return {
          state: p,
          warnings: [
            `relink-concept: concept '${op.conceptName}' not found in draft; no change made.`,
          ],
        };
      }

      // Step 1: Remove the concept name from every lesson.
      const stripped = p.proposedLessons.map((l) => ({
        ...l,
        conceptNames: l.conceptNames.filter((n) => n !== op.conceptName),
      }));

      if (op.lessonIndex === -1) {
        // Orphan: remove from all lessons, keep node + edges.
        return ok({ ...p, proposedLessons: stripped });
      }

      // Step 2: Insert into the destination lesson at afterConceptIndex+1 (or end).
      const dest = stripped[op.lessonIndex];
      if (!dest) throw new Error(`relink-concept: lessonIndex ${op.lessonIndex} out of bounds`);
      const names = [...dest.conceptNames];
      const insertAt = op.afterConceptIndex !== undefined ? op.afterConceptIndex + 1 : names.length;
      names.splice(insertAt, 0, op.conceptName);
      const ls = [...stripped];
      ls[op.lessonIndex] = { ...dest, conceptNames: names };
      return ok({ ...p, proposedLessons: ls });
    }

    case "add-edge": {
      const known = new Set(p.proposedConcepts.map((c) => c.name.trim().toLowerCase()));
      const fromLower = op.fromName.trim().toLowerCase();
      const toLower = op.toName.trim().toLowerCase();
      if (!known.has(fromLower))
        throw new Error(`add-edge: concept "${op.fromName}" not found in draft`);
      if (!known.has(toLower))
        throw new Error(`add-edge: concept "${op.toName}" not found in draft`);
      if (fromLower === toLower) throw new Error("add-edge: self-edges are not allowed");
      const duplicate = p.proposedEdges.some(
        (e) =>
          e.fromName.trim().toLowerCase() === fromLower &&
          e.toName.trim().toLowerCase() === toLower,
      );
      if (duplicate)
        throw new Error(`add-edge: edge from "${op.fromName}" to "${op.toName}" already exists`);
      const newEdge = {
        fromName: op.fromName.trim(),
        toName: op.toName.trim(),
        strength: Math.max(0, Math.min(1, op.strength)),
        rationale: op.rationale?.trim() ?? "",
      };
      return ok({ ...p, proposedEdges: [...p.proposedEdges, newEdge] });
    }

    case "remove-unit": {
      const unit = (p.proposedUnits ?? []).find((u) => u.draftUnitId === op.draftUnitId);
      if (!unit) {
        return {
          state: p,
          warnings: [`remove-unit: unit with id '${op.draftUnitId}' not found; no change made.`],
        };
      }
      const lessonCount = unit.draftLessonIds.length;
      const units = (p.proposedUnits ?? []).filter((u) => u.draftUnitId !== op.draftUnitId);
      const warning =
        `removed unit '${unit.name}' (id ${op.draftUnitId}); ` +
        `it contained ${lessonCount} lesson reference${lessonCount !== 1 ? "s" : ""}`;
      return { state: { ...p, proposedUnits: units }, warnings: [warning] };
    }

    case "validate-draft": {
      const issues = validateProposed(p);
      if (issues.length === 0) return ok(p);
      const warnings = issues.map((issue) => `${issue.kind}: ${issue.message}`);
      return { state: p, warnings };
    }

    default: {
      // Exhaustiveness check: TypeScript will error here if a new op.kind is added
      // without a case above.
      const _exhaustive: never = op;
      throw new Error(`Unknown DraftEditOp kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

interface PersistDraftTxArgs {
  tx: PraxisDb;
  draft: DraftCourseState;
  now: Date;
}

/**
 * Inner body of the confirmDraft transaction. Accepts an already-open Drizzle
 * transaction handle so that `markConfirmedTx` can run in the same tx —
 * keeping the confirm atomic with the course write.
 *
 * All writes use the provided `tx` — no nested transaction is opened here.
 */
function persistDraftTx(args: PersistDraftTxArgs): {
  courseId: CourseId;
  lessonIds: LessonId[];
  conceptGraphId: string;
} {
  const { tx, draft, now } = args;

  // 1. ConceptGraph row.
  const conceptGraphId = uuidv7();
  tx.insert(conceptGraphs)
    .values({
      id: conceptGraphId,
      source: "extracted",
      name: `${draft.proposed.title} graph`,
      version: "1",
      createdAt: now,
    })
    .run();

  // 2. Concept rows — assign stable UUIDs keyed by name.
  const conceptIdByName = new Map<string, string>();
  const conceptRowValues = draft.proposed.proposedConcepts.map((c) => {
    const id = uuidv7();
    conceptIdByName.set(c.name, id);
    return {
      id,
      graphId: conceptGraphId,
      name: c.name,
      description: c.description,
      aliasesJson: [] as string[],
      standardsTagsJson: [] as string[],
    };
  });
  if (conceptRowValues.length > 0) {
    tx.insert(concepts).values(conceptRowValues).run();
  }

  // 3. Prerequisite edge rows.
  const edgeRowValues = draft.proposed.proposedEdges.map((e) => ({
    // biome-ignore lint/style/noNonNullAssertion: edge names validated against conceptIdByName in validateProposed
    fromId: conceptIdByName.get(e.fromName)!,
    // biome-ignore lint/style/noNonNullAssertion: edge names validated against conceptIdByName in validateProposed
    toId: conceptIdByName.get(e.toName)!,
    strengthMilli: Math.round(Math.max(0, Math.min(1, e.strength)) * 1000),
    source: "extracted" as const,
  }));
  if (edgeRowValues.length > 0) {
    tx.insert(prerequisiteEdges).values(edgeRowValues).run();
  }

  // 4. Course row.
  const courseId = uuidv7();
  tx.insert(courses)
    .values({
      id: courseId,
      studentId: draft.studentId,
      title: draft.proposed.title,
      subject: draft.proposed.subject,
      gradeLevel: draft.proposed.gradeLevel,
      sourceJson: { kind: "bootstrapped", sourceMaterials: draft.documentIds },
      conceptGraphId,
      thresholdsJson: draft.proposed.thresholds,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // 5. Lesson rows — preserve declared order.
  const lessonRowValues = draft.proposed.proposedLessons.map((l, i) => ({
    id: uuidv7(),
    courseId,
    title: l.title,
    orderIndex: i,
    // biome-ignore lint/style/noNonNullAssertion: concept names validated against conceptIdByName in validateProposed
    conceptIdsJson: l.conceptNames.map((n) => conceptIdByName.get(n)!),
    referencesJson: l.references,
    suggestedStrategy: l.suggestedStrategy,
    estimatedMinutes: l.estimatedMinutes,
  }));
  if (lessonRowValues.length > 0) {
    tx.insert(lessons).values(lessonRowValues).run();
  }

  // 6. Skeleton gates — one per lesson, chained, all initially locked.
  //    Phase 9 overwrites with proper gate evaluation. Phase 6 just persists
  //    rows so future code can find them.
  const gateIds = lessonRowValues.map(() => uuidv7());
  const gateRowValues = lessonRowValues.map((l, i) => ({
    // biome-ignore lint/style/noNonNullAssertion: gateIds is same-length as lessonRowValues; i is a valid index
    id: gateIds[i]!,
    courseId,
    guardsJson: { kind: "lesson", lessonId: l.id },
    // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
    prerequisitesJson: i > 0 ? [gateIds[i - 1]!] : [],
    successCriteriaJson: {
      kind: "mastery-threshold",
      conceptIds: l.conceptIdsJson,
      minScore: draft.proposed.thresholds.conceptMastery,
    },
    stateJson: {
      kind: "locked",
      // biome-ignore lint/style/noNonNullAssertion: gateIds[i-1] exists for i > 0
      missingPrerequisites: i > 0 ? [gateIds[i - 1]!] : [],
    },
    evidenceJson: [],
  }));
  if (gateRowValues.length > 0) {
    tx.insert(gates).values(gateRowValues).run();
  }

  // Build a map from draftLessonId → real lessonId for unit/assessment wiring.
  const draftLessonIdToLessonId = new Map<string, string>();
  draft.proposed.proposedLessons.forEach((pl, i) => {
    const row = lessonRowValues[i];
    if (row) draftLessonIdToLessonId.set(pl.draftLessonId, row.id);
  });

  // Helper: materialise an assessment shell inside the transaction.
  function materializeShell(shellInput: {
    kind: "quiz" | "homework" | "exam";
    title: string;
    conceptNames: string[];
  }): string {
    const assignmentId = uuidv7();
    const conceptIds = shellInput.conceptNames.map((n) => {
      const id = conceptIdByName.get(n);
      if (!id) throw new Error(`assessment shell refs unknown concept: "${n}"`);
      return id;
    });
    tx.insert(assignments)
      .values({
        id: assignmentId,
        courseId,
        kind: shellInput.kind,
        title: shellInput.title,
        itemsJson: [],
        conceptIdsJson: conceptIds,
        assignedAt: now,
        submittedAt: null,
        gradeJson: null,
        parentSessionId: null,
      })
      .run();
    return assignmentId;
  }

  // 7. Phase 16: materialise units, lesson_units, and summative assignment shells.
  for (const [i, proposedUnit] of (draft.proposed.proposedUnits ?? []).entries()) {
    const unitId = uuidv7();
    tx.insert(courseUnits)
      .values({
        id: unitId,
        courseId,
        name: proposedUnit.name,
        summary: proposedUnit.summary ?? null,
        orderIndex: i,
        summativeAssignmentId: null,
      })
      .run();

    // Bind lessons to this unit.
    for (const draftLessonId of proposedUnit.draftLessonIds) {
      const lessonId = draftLessonIdToLessonId.get(draftLessonId);
      if (!lessonId) {
        throw new Error(`unit "${proposedUnit.name}" refs unknown lesson id "${draftLessonId}"`);
      }
      tx.insert(lessonUnits).values({ lessonId, unitId }).run();
    }

    // Materialise summative if present.
    if (proposedUnit.summative) {
      const summativeId = materializeShell({
        kind: proposedUnit.summative.kind,
        title: proposedUnit.summative.title,
        conceptNames: proposedUnit.summative.conceptNames,
      });
      tx.update(courseUnits)
        .set({ summativeAssignmentId: summativeId })
        .where(eq(courseUnits.id, unitId))
        .run();
    }
  }

  // 8. Phase 16: materialise per-lesson assessment shells.
  for (const la of draft.proposed.proposedLessonAssessments ?? []) {
    const lessonId = draftLessonIdToLessonId.get(la.draftLessonId);
    if (!lessonId) {
      throw new Error(
        `lesson assessment "${la.title}" refs unknown lesson id "${la.draftLessonId}"`,
      );
    }
    const assignmentId = materializeShell({
      kind: la.kind,
      title: la.title,
      conceptNames: la.conceptNames,
    });
    tx.insert(lessonAssessments)
      .values({
        id: uuidv7(),
        lessonId,
        assignmentId,
        timing: la.timing,
        purpose: la.purpose,
      })
      .run();
  }

  // 9. Phase 16: write assessment plan onto the course row if present.
  if (draft.proposed.assessmentPlan !== undefined) {
    tx.update(courses)
      .set({
        assessmentPlanJson: draft.proposed.assessmentPlan as unknown as Record<string, unknown>,
      })
      .where(eq(courses.id, courseId))
      .run();
  }

  return {
    courseId: brandId<"CourseId">(courseId),
    lessonIds: lessonRowValues.map((r) => brandId<"LessonId">(r.id)),
    conceptGraphId,
  };
}
