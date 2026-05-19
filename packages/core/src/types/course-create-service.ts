import type {
  AssessmentPlan,
  DraftCourseState,
  DraftEditOp,
  DraftSummary,
  Reference,
  ThresholdConfig,
} from "./artifacts.js";
import type {
  ConceptGraphId,
  CourseId,
  DocumentId,
  LessonId,
  SessionId,
  StrategyId,
  StudentId,
} from "./ids.js";

// ─── Phase 6: CourseCreateService ─────────────────────────────────────────────

/** Issue returned by finalizeDraft validation. */
export interface DraftIssue {
  kind: string;
  message: string;
}

export interface CourseCreateService {
  // ── Phase 16: incremental draft mutations ─────────────────────────────────

  /** Create an empty draft and return its id. */
  initDraft(input: {
    studentId: StudentId;
    /**
     * Phase 16 (course-create-session-scoped-attachment): the parent course-create
     * session id (S1). Pass `ctx.parentSessionId ?? ctx.sessionId` from the
     * draft_init tool handler. Stored on the draft so confirmDraft can promote
     * session-scope document rows to course-scope.
     */
    sessionId?: SessionId;
    documentIds: DocumentId[];
    courseTitle: string;
    subject: string;
    gradeLevel: string;
  }): Promise<{ draftId: string }>;

  /** Add a concept. Returns ok:false (no throw) on duplicate name. */
  addConcept(input: {
    draftId: string;
    name: string;
    description: string;
  }): Promise<{ ok: true; conceptCount: number } | { ok: false; reason: string }>;

  /** Remove a concept (and cascading edges + lesson references). */
  removeConcept(input: {
    draftId: string;
    name: string;
  }): Promise<{ ok: boolean; reason?: string }>;

  /** Add a prerequisite edge between two existing concepts. */
  addEdge(input: {
    draftId: string;
    fromName: string;
    toName: string;
    strength: number;
    rationale: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;

  /** Add a lesson. Every conceptName must already exist. */
  addLesson(input: {
    draftId: string;
    title: string;
    conceptNames: string[];
    references: ReadonlyArray<Reference>;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
  }): Promise<{ ok: true; lessonIndex: number } | { ok: false; reason: string }>;

  /** Remove a lesson by index. */
  removeLesson(input: {
    draftId: string;
    lessonIndex: number;
  }): Promise<{ ok: boolean; reason?: string }>;

  /** Update draft title/subject/gradeLevel/thresholds. */
  setMetadata(input: {
    draftId: string;
    title?: string;
    subject?: string;
    gradeLevel?: string;
    thresholds?: Partial<ThresholdConfig>;
  }): Promise<{ ok: boolean; reason?: string }>;

  /**
   * Build a compact DraftSummary from the live draft state. Returns null if
   * the draft is gone (expired or never existed). Used by the drafter
   * to surface partial progress to the tutor without forcing a separate
   * "finalize" ritual, and by the tutor's UI to render quick metrics.
   */
  summarize(draftId: string): Promise<DraftSummary | null>;

  // ── Phase 16: unit + assessment scaffold ──────────────────────────────────

  /**
   * Group draft lessons into a named unit. Optionally attach a summative
   * assessment at the end of the unit.
   * Returns ok:false if any draftLessonId doesn't exist in the draft.
   */
  addUnit(input: {
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
  }): Promise<{ ok: true; draftUnitId: string } | { ok: false; reason: string }>;

  /**
   * Declare the overall assessment scaffold shape. Stored verbatim onto the
   * draft; materialised as assessmentPlanJson on the course row at persist time.
   */
  setAssessmentPlan(input: {
    draftId: string;
    plan: AssessmentPlan;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;

  /**
   * Schedule an assessment attached to a specific lesson.
   * Returns ok:false if the draftLessonId or any conceptName doesn't exist.
   */
  addLessonAssessment(input: {
    draftId: string;
    draftLessonId: string;
    kind: "quiz" | "homework" | "exam";
    timing: "before" | "after" | "interleaved";
    purpose: "readiness" | "practice" | "checkpoint";
    conceptNames: string[];
    expectedItemCount?: number;
    rationale: string;
    title: string;
  }): Promise<{ ok: true; draftAssessmentId: string } | { ok: false; reason: string }>;

  // ── Existing methods ──────────────────────────────────────────────────────
  showDraft(draftId: string): Promise<DraftCourseState | null>;
  editDraft(input: {
    draftId: string;
    op: DraftEditOp;
  }): Promise<{ draft: DraftCourseState; warnings: readonly string[] }>;
  /**
   * Validate and persist the draft. Returns the persisted course identifiers
   * on success or structured `issues[]` on validation failure. Throws only on
   * lifecycle errors (draft expired / owner mismatch) — those aren't data the
   * model can fix.
   */
  confirmDraft(input: {
    draftId: string;
    studentId: StudentId;
  }): Promise<
    | { ok: true; courseId: CourseId; lessonIds: LessonId[]; conceptGraphId: string }
    | { ok: false; issues: ReadonlyArray<DraftIssue> }
  >;
  discardDraft(draftId: string): Promise<void>;
  /**
   * Active drafts for a specific student, ordered by lastTouchedAt DESC.
   * Returns drafts that are neither confirmed nor discarded.
   */
  listActiveForStudent(studentId: StudentId): readonly DraftCourseState[];
  /**
   * Phase 10: Create a course directly from an imported canonical pack.
   * Groups concepts into lessons (one per 5-8 sequential concepts) and inserts
   * course + lessons + skeleton gates in a single transaction.
   */
  createCourseFromPack(input: {
    studentId: StudentId;
    packId: string;
    conceptGraphId: ConceptGraphId;
    courseTitle: string;
    gradeLevel: string;
  }): Promise<{ courseId: string; conceptCount: number }>;

  // ── Chunked-query tools (expressive-draft-api) ───────────────────────────

  /**
   * List all units in a draft with summary metrics.
   * Returns null if the draft is not found.
   */
  listUnits(draftId: string): Promise<UnitListEntry[] | null>;

  /**
   * List lessons within a specific unit.
   * Returns null if the draft is not found, or if the draftUnitId is not found
   * within the draft.
   */
  listLessonsInUnit(input: { draftId: string; draftUnitId: string }): Promise<LessonsInUnit | null>;

  /**
   * Return full lesson detail including concept names, assessments, and parent unit.
   * Returns null if the draft or the draftLessonId is not found.
   */
  getLessonDetail(input: { draftId: string; draftLessonId: string }): Promise<LessonDetail | null>;

  /**
   * Inspect referential integrity of the draft.
   * Returns null if the draft is not found.
   */
  listDanglingRefs(draftId: string): Promise<DanglingRefsReport | null>;
}

// ─── Chunked-query return types ───────────────────────────────────────────────

/** One entry in the list returned by `CourseCreateService.listUnits`. */
export interface UnitListEntry {
  draftUnitId: string;
  name: string;
  summary?: string;
  lessonCount: number;
  hasSummative: boolean;
}

/** Result of `CourseCreateService.listLessonsInUnit`. */
export interface LessonsInUnit {
  draftUnitId: string;
  unitName: string;
  lessons: Array<{
    draftLessonId: string;
    title: string;
    conceptCount: number;
    assessmentCount: number;
  }>;
}

/** Result of `CourseCreateService.getLessonDetail`. */
export interface LessonDetail {
  draftLessonId: string;
  title: string;
  conceptNames: string[];
  assessments: Array<{
    draftAssessmentId: string;
    kind: "quiz" | "homework" | "exam";
    timing: "before" | "after" | "interleaved";
    purpose: "readiness" | "practice" | "checkpoint";
    title: string;
  }>;
  parentUnit: { draftUnitId: string; name: string } | null;
}

/** Result of `CourseCreateService.listDanglingRefs`. */
export interface DanglingRefsReport {
  orphanConcepts: string[];
  danglingUnitMemberships: Array<{
    draftUnitId: string;
    unitName: string;
    badLessonIds: string[];
  }>;
  danglingLessonAssessments: Array<{
    draftAssessmentId: string;
    badLessonId: string;
  }>;
  edgesReferencingUnknownConcepts: Array<{
    fromName: string;
    toName: string;
  }>;
}
