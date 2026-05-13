import type { z } from "zod";
import type { ActivityRegistry } from "./activity.js";
import type {
  AssessmentPlan,
  Assignment,
  AssignmentItem,
  AssignmentResponse,
  AssignmentSubmissionResult,
  Course,
  CourseSummary,
  DraftCourseState,
  DraftEditOp,
  DraftSummary,
  Flashcard,
  Gate,
  GateTarget,
  Lesson,
  Note,
  NoteContext,
  Reference,
  SuccessCriteria,
  ThresholdConfig,
} from "./artifacts.js";
import type { ProgressSnapshot } from "./client.js";
import type { Logger, TimeRange, Timestamp } from "./common.js";
import type { ConfiguratorActionRow } from "./configurator.js";
import type { Engine, VisionDescribeRequest, VisionDescribeResponse } from "./engine.js";
import type { FsrsScheduler, FsrsState, Rating } from "./flashcards.js";
import type { GateView, GradeReader, MasteryReader } from "./gate.js";
import type {
  AssignmentId,
  ConceptGraphId,
  ConceptId,
  ConfiguratorId,
  CourseId,
  DocumentId,
  FlashcardId,
  GateId,
  LessonId,
  MisconceptionId,
  NoteId,
  SessionId,
  StrategyId,
  StudentId,
  TechniqueId,
} from "./ids.js";
import type {
  AffectiveModel,
  EpisodicEvent,
  IndexerOrchestrator,
  MemoryExport,
  Misconception,
  ProceduralModel,
  StudentModel,
} from "./memory.js";
import type { NoteBody } from "./notes.js";
import type {
  MetacognitivePrompt,
  MetacognitivePromptTrigger,
  PedagogyPack,
  StudyTechnique,
  TeachingStrategy,
} from "./pedagogy.js";
import type { ComposedSystemPromptWithAttribution } from "./prompt-attribution.js";
import type { QuickCheckService } from "./quick-check.js";
import type { SketchService } from "./sketches.js";
import type { SubAgentRegistry } from "./subagent.js";
import type {
  DocumentScope,
  DocumentScopeAttachment,
  DocumentScopeSource,
} from "./document-scopes.js";

// Re-export VisionService shape inline here so tool handlers can type-check against it
// without importing from @praxis/core/services (would violate dependency direction).
export interface VisionService {
  describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse>;
}

export type EffectKind =
  | "memory.write"
  | "artifact.mutate"
  | "gate.evaluate"
  | "external.network"
  | "external.code-exec"
  | "none";

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string;
  description: string;
  input: I;
  output: O;
  tier: "deterministic" | "grounded" | "model-derived";
  effects: ReadonlyArray<EffectKind>;
  handler(args: z.infer<I>, ctx: ToolContext): Promise<z.infer<O>>;
}

/**
 * Service handles available to tool handlers. These are placeholders in
 * Phase 1 — concrete service implementations land in subsequent phases.
 */
export interface ToolContext {
  studentId: StudentId;
  sessionId: SessionId;
  /** Phase 6: when the active session was started with a courseId, propagated here. */
  courseId?: CourseId;
  /**
   * Phase 8: when the active session is bound to an assignment, propagated here.
   * Agent 2 wires this from the session row's assignmentId column.
   */
  assignmentId?: AssignmentId;
  /**
   * Phase 16: pre-computed list of document ids attached to `courseId`.
   * Populated only when `courseId` is set; tools that scope to course
   * documents (e.g., `retrieve_from_documents`) consume this directly to
   * avoid an extra DB call per dispatch. Empty array means "no documents
   * attached yet" — tools should return empty results, not fall back to
   * library scope.
   */
  courseDocumentIds?: DocumentId[];
  /**
   * Phase 16: present only inside the explorer agent's isolated session.
   * The draft-mutation tools read it to know which draft to mutate. Outside
   * the explorer, this is undefined.
   */
  draftId?: string;
  /**
   * Agent-transparency (feature-agent-transparency-ux): the engine-emitted
   * tool_call.callId for this invocation. Populated by
   * `InProcessToolRegistry.dispatch(name, args, { callId })` when the engine
   * adapter passes the per-request correlation id. Tools that spawn sub-agents
   * (e.g., `course.start_exploration`) use this as their `parentCallId` when
   * registering on `SubAgentRegistry` so the UI can subscribe to the right stream.
   * Absent when dispatched from test stubs that don't supply a callId.
   */
  callId?: string;
  /**
   * AbortSignal for the current engine turn. Populated by
   * `InProcessToolRegistry.dispatch(name, args, { signal })` when the engine
   * adapter passes the per-turn signal. Tools should check `signal?.aborted`
   * at entry and periodically during long loops; sub-agent-spawning tools
   * pass it into the sub-agent's engine session so cancellation propagates
   * recursively. Absent when dispatched from test stubs that don't supply a
   * signal.
   */
  signal?: AbortSignal;
  services: ToolServices;
  log: Logger;
}

export interface ToolServices {
  /** Phase 7: concretized from unknown. */
  memory: MemoryService;
  /** Phase 6: concretized from unknown. */
  artifacts: ArtifactsService;
  vectorStore: VectorStore; // ← Phase 5
  ftsStore: FtsStore; // ← Phase 5
  sandbox: CodeSandbox; // ← Phase 4
  sympy: SymPyService; // ← Phase 4
  embeddings: EmbeddingService; // ← Phase 5
  documents: DocumentsReader; // ← Phase 5
  /** Phase 6: bootstrap draft management. */
  bootstrap: BootstrapService;
  /** Phase 6: narrow read-only course state for tools and brief composition. */
  courseState: CourseStateReader;
  /**
   * Phase 7: used by active-path tools to schedule indexer re-runs after a tool-driven write.
   * Optional to keep tests that don't wire indexers working.
   */
  indexerOrchestrator?: IndexerOrchestrator;
  /** Phase 8: assignment create/submit/read — server-side. */
  assignments: AssignmentService;
  /** Phase 10: pack import + listing — canonical curriculum packs. */
  packs: PackImportService;
  /** Phase 18: pedagogy pack read-only service. */
  pedagogyPack: PedagogyPackService;
  /** Phase 11: local lock code gate. */
  lock: LockService;
  /** Phase 11: configurator-driven authoring + memory writes. */
  authoring: AuthoringService;
  /** Phase 12: notes management — create, update, list, delete. */
  notes: NotesService;
  /** Phase 12: flashcard management + FSRS review. */
  flashcards: FlashcardsService;
  /** Phase 12: FSRS scheduler — used by FlashcardsServiceImpl and flashcard.review_next tool. */
  fsrsScheduler: FsrsScheduler;
  /** Phase 15a: sketch storage + retrieval — used by sketch.read and grade_math sketch case. */
  sketches?: SketchService;
  /** Phase 15a: vision capability wrapper — used by grade_math sketch case to OCR drawings. */
  vision?: VisionService;
  /** Phase 16: polymorphic scope ↔ document attachment management. */
  documentScopes: DocumentScopesService;
  /**
   * Phase 16: resolves the user's currently configured engine at call time.
   * Used by tools that spawn isolated agent sessions (e.g., start_exploration,
   * rubric grader). Same lazy-resolver pattern as visionResolver.
   */
  engineResolver: () => Engine;
  /**
   * Resolves user-tunable bootstrap config (currently just `maxSteps` —
   * the explore agent's tool-call budget). Read at call time so UI changes
   * take effect on the next exploration without a restart. Used by
   * `course.start_exploration`. Optional so test stubs that don't exercise
   * the bootstrap path don't need to wire it.
   */
  bootstrapConfigResolver?: () => { maxSteps: number };
  /**
   * Activity registry for ambient progress reporting via the activity rail.
   * Optional so tools that don't need it and test stubs stay simple.
   * Wired in session-service.ts from ServiceDeps.activity.
   */
  activity?: ActivityRegistry;
  /**
   * Sub-agent transparency registry. Optional so tools that don't spawn
   * sub-agents and test stubs that don't wire it stay simple.
   * Wired in session-service.ts from ServiceDeps.subAgent.
   */
  subAgent?: SubAgentRegistry;
  /**
   * Phase 17: human-in-the-loop dispatch for quick_check.* tools.
   * Optional so existing tool stubs and tests don't need to wire it.
   */
  quickCheck?: QuickCheckService;
}

// ─── Phase 12: NotesService ───────────────────────────────────────────────────

/** Server-side NotesService. Methods take studentId where applicable. */
export interface NotesService {
  create(input: {
    studentId: StudentId;
    format: "cornell" | "feynman" | "outline" | "free";
    body: NoteBody;
    context?: NoteContext;
  }): Promise<Note>;

  update(input: { studentId: StudentId; noteId: NoteId; body: NoteBody }): Promise<Note>;

  get(input: { studentId: StudentId; noteId: NoteId }): Promise<Note | null>;

  list(input: {
    studentId: StudentId;
    courseId?: CourseId;
    lessonId?: LessonId;
    format?: "cornell" | "feynman" | "outline" | "free";
    limit?: number;
  }): Promise<Note[]>;

  delete(input: { studentId: StudentId; noteId: NoteId }): Promise<void>;

  /**
   * Phase 12: Generate a structured note from a session's episodic events via a
   * one-shot LLM call. Reads events, composes them into a prompt, runs runOneShot,
   * parses the result, and persists.
   */
  fromSessionSummary(input: {
    studentId: StudentId;
    sessionId: string;
    format: "cornell" | "feynman" | "outline" | "free";
  }): Promise<Note>;
}

// ─── Phase 12: FlashcardsService ─────────────────────────────────────────────

/** Server-side FlashcardsService. */
export interface FlashcardsService {
  create(input: {
    studentId: StudentId;
    front: string;
    back: string;
    conceptId?: ConceptId;
    source?: { kind: "authored" | "extracted" | "user-created"; ref?: string };
  }): Promise<Flashcard>;

  update(input: {
    studentId: StudentId;
    flashcardId: FlashcardId;
    patch: Partial<Pick<Flashcard, "front" | "back" | "conceptId">>;
  }): Promise<Flashcard>;

  get(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<Flashcard | null>;

  list(input: {
    studentId: StudentId;
    conceptId?: ConceptId;
    due?: boolean;
    limit?: number;
  }): Promise<Flashcard[]>;

  delete(input: { studentId: StudentId; flashcardId: FlashcardId }): Promise<void>;

  /**
   * Record a rating; compute the new FSRS state; persist; return the new card row.
   */
  review(input: {
    studentId: StudentId;
    flashcardId: FlashcardId;
    rating: Rating;
  }): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }>;

  /** Total count of cards currently due (`nextReviewAt <= now`). */
  dueCount(input: { studentId: StudentId }): Promise<number>;
}

// Re-export FsrsScheduler, FsrsState, Rating so callers can import from tool.ts.
export type { FsrsScheduler, FsrsState, Rating };

// ─── Phase 11: LockService ───────────────────────────────────────────────────

/** Server-side lock service — local code-gating. */
export interface LockService {
  /** Whether a lock code is set. */
  isSet(): Promise<boolean>;
  /**
   * Whether the current process has been unlocked.
   * Always true when no lock is set.
   */
  isUnlocked(): Promise<boolean>;
  /** Set/replace the lock code. Throws if the new code fails policy (4–8 digits). */
  setLockCode(input: { code: string }): Promise<void>;
  /** Verify code; on success, marks the current process unlocked. */
  unlock(input: { code: string }): Promise<{ ok: boolean }>;
  /** Lock the current process (clears the unlocked-this-session flag). */
  lock(): Promise<void>;
  /** Clear the lock entirely (factory-reset path). Requires the current code. */
  clearLock(input: { currentCode: string }): Promise<void>;
}

// ─── Phase 11: AuthoringService (server-side) ───────────────────────────────

/**
 * Server-side AuthoringService — orchestrates configurator writes to
 * artifacts + memory + prompt overrides, and appends audit log rows.
 *
 * Methods with studentId are server-side only; client-side AuthoringClient
 * in client.ts omits studentId (IPC handlers resolve it).
 */
export interface AuthoringService {
  // ── Course / lesson / gate ────────────────────────────────────────────────
  updateCourse(input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course>;

  createLesson(input: {
    courseId: CourseId;
    title: string;
    conceptIds: ConceptId[];
    orderIndex?: number;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
    references?: Reference[];
  }): Promise<Lesson>;

  updateLesson(input: {
    lessonId: LessonId;
    patch: Partial<
      Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">
    >;
  }): Promise<Lesson>;

  deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void>;

  createGate(input: {
    courseId: CourseId;
    guards: GateTarget;
    prerequisites: GateId[];
    successCriteria: SuccessCriteria;
  }): Promise<Gate>;

  updateGate(input: {
    gateId: GateId;
    patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
    reason?: string;
  }): Promise<Gate>;

  deleteGate(input: { gateId: GateId; reason?: string }): Promise<void>;

  overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate>;

  getCourseSummary(courseId: CourseId): Promise<{
    course: Course;
    lessons: Lesson[];
    gates: Gate[];
    concepts: Array<{
      id: string;
      graphId: string;
      name: string;
      description: string;
      aliases: string[];
      standardsTags: string[];
    }>;
  }>;

  // ── Prompt customization ──────────────────────────────────────────────────
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;
  clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void>;
  setStyleSliders(input: { socratic: number; verbosity: number; formality: number }): Promise<void>;
  /** Set the global cross-mode fragment. Pass null to clear. */
  setGlobalPrompt(text: string | null): Promise<void>;
  /** Get the current global fragment text, or null if none is set. */
  getGlobalPrompt(): Promise<string | null>;
  /** Set the per-mode append for a specific mode. Pass null to clear. */
  setModeAppend(input: { modeId: string; text: string | null }): Promise<void>;
  /** Get the per-mode append for a specific mode, or null if none is set. */
  getModeAppend(modeId: string): Promise<string | null>;
  /**
   * Compose the full system prompt for modeId against current stored state.
   * Draft overrides substitute the stored values without persisting.
   */
  previewPrompt(input: {
    modeId: string;
    draftGlobal?: string | null;
    draftAppend?: string | null;
  }): Promise<string>;

  /**
   * Structured preview returning the composed prompt plus per-segment source
   * attribution. Used by the diff-aware preview pane. Same draft semantics as
   * `previewPrompt`.
   */
  previewPromptWithAttribution(input: {
    modeId: string;
    draftGlobal?: string | null;
    draftAppend?: string | null;
  }): Promise<ComposedSystemPromptWithAttribution>;

  // ── Memory administration ─────────────────────────────────────────────────
  resetConcept(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    reason: string;
  }): Promise<void>;
  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void>;
  exportMemory(input: {
    studentId: StudentId;
    targetPath: string;
  }): Promise<{ ok: true; bytesWritten: number }>;
  deleteAllMemory(input: { studentId: StudentId; reason: string; confirm: true }): Promise<void>;

  // ── Audit log ─────────────────────────────────────────────────────────────
  listConfiguratorActions(input?: {
    fromTs?: Timestamp;
    limit?: number;
  }): Promise<ConfiguratorActionRow[]>;
}

// ConfiguratorAction and ConfiguratorActionRow are re-exported via index.ts's
// `export type * from "./configurator.js"` — no additional re-export needed here.

// ─── Phase 6: ArtifactsService ───────────────────────────────────────────────

export interface ArtifactsService {
  course(id: CourseId): Promise<Course | null>;
  courses(studentId: StudentId): Promise<CourseSummary[]>;
  lessons(courseId: CourseId): Promise<Lesson[]>;
  gates(courseId: CourseId): Promise<Gate[]>;
  progress(studentId: StudentId): Promise<ProgressSnapshot>;
  markLessonStarted(input: { studentId: StudentId; lessonId: LessonId }): Promise<void>;
  markConceptStudied(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    evidenceEventId?: string;
  }): Promise<{ lessonComplete: boolean; lessonId: LessonId | null }>;
  /** Phase 6: list ingested documents for bootstrap's list_library_documents tool. */
  listDocuments(studentId: StudentId): Promise<DocumentSummaryItem[]>;

  /** Phase 9: Computed enriched view of all gates for a course. Pure read. */
  gateView(input: { studentId: StudentId; courseId: CourseId }): Promise<GateView[]>;

  /**
   * Phase 9: Run gate evaluation for the course, persist transitions atomically,
   * write gate_unlock_events for newly-unlocked gates. Returns unlocked gate IDs.
   */
  evaluateAndPersistGates(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<{ unlockedGateIds: GateId[] }>;

  /**
   * Phase 9: Mark all unlock events for a course as "viewed by student".
   * Used to clear the courses-list "newly unlocked" badge.
   */
  markGatesViewed(input: { studentId: StudentId; courseId: CourseId }): Promise<void>;

  /**
   * Phase 9: Count of unlock events for a course since the last markGatesViewed
   * (or all unlock events if never viewed). Used by CoursesList badge.
   */
  newlyUnlockedCount(input: { studentId: StudentId; courseId: CourseId }): Promise<number>;

  /**
   * Phase 10: Return the full concept list for a course (names + descriptions + tags).
   * Joined via the course's conceptGraphId. Concept ids are PREFIXED (e.g.,
   * "<graphId>:algebra-1.real-numbers") for canonical packs; extracted courses
   * use plain UUIDs. Callers should treat the id as an opaque string.
   */
  concepts(courseId: CourseId): Promise<
    Array<{
      id: string;
      graphId: string;
      name: string;
      description: string;
      aliases: string[];
      standardsTags: string[];
    }>
  >;

  // ── Phase 11: Configurator write methods ──────────────────────────────────

  updateCourse(input: {
    courseId: CourseId;
    patch: Partial<
      Pick<Course, "title"> & { subject: string; gradeLevel: string; thresholds: ThresholdConfig }
    >;
    reason?: string;
  }): Promise<Course>;

  createLesson(input: {
    courseId: CourseId;
    title: string;
    conceptIds: ConceptId[];
    orderIndex?: number;
    suggestedStrategy?: StrategyId;
    estimatedMinutes?: number;
    references?: Reference[];
  }): Promise<Lesson>;

  updateLesson(input: {
    lessonId: LessonId;
    patch: Partial<
      Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">
    >;
  }): Promise<Lesson>;

  deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void>;

  createGate(input: {
    courseId: CourseId;
    guards: GateTarget;
    prerequisites: GateId[];
    successCriteria: SuccessCriteria;
  }): Promise<Gate>;

  updateGate(input: {
    gateId: GateId;
    patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
    reason?: string;
  }): Promise<Gate>;

  deleteGate(input: { gateId: GateId; reason?: string }): Promise<void>;

  overrideGate(input: {
    gateId: GateId;
    reason: string;
    configuratorId: ConfiguratorId;
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<Gate>;

  getCourseSummary(courseId: CourseId): Promise<{
    course: Course;
    lessons: Lesson[];
    gates: Gate[];
    concepts: Array<{
      id: string;
      graphId: string;
      name: string;
      description: string;
      aliases: string[];
      standardsTags: string[];
    }>;
  }>;
}

// Re-export gate ports so callers can import from tool.ts.
export type { GateView, GradeReader, MasteryReader };

export interface DocumentSummaryItem {
  documentId: DocumentId;
  filename: string;
  mimeType: string;
  chunkCount: number;
  hasPageImages: boolean;
}

// ─── DocumentScopesService ───────────────────────────────────────────────────

/**
 * Many-to-many between scopes (course, session, …) and the student's
 * library documents. A document can be attached to zero, one, or many
 * scopes. The student library (`documents` table) is the SSOT — this
 * service only manages links.
 */
export interface DocumentScopesService {
  /** All document ids attached to a scope, in attach order. */
  listForScope(scope: DocumentScope): Promise<DocumentId[]>;

  /** Enriched summaries for the scope's documents (tool / UI output). */
  listForScopeDetailed(scope: DocumentScope): Promise<DocumentScopeAttachment[]>;

  /**
   * Attach. Idempotent on (documentId, scope.kind, scope.id).
   * Returns true iff a row was inserted.
   */
  attach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
    source: DocumentScopeSource;
  }): Promise<{ attached: boolean }>;

  /** Detach. Idempotent. */
  detach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
  }): Promise<{ detached: boolean }>;

  /**
   * Bulk attach (e.g., confirm-draft, multi-file ingest). Skips
   * already-attached documents. Returns the newly attached ids.
   */
  attachMany(input: {
    scope: DocumentScope;
    documentIds: ReadonlyArray<DocumentId>;
    source: DocumentScopeSource;
  }): Promise<{ newlyAttached: DocumentId[] }>;

  /**
   * All scopes a document is currently attached to.
   * Used by Orphaned detection in the library view (a document with
   * zero scope rows is orphaned).
   */
  listScopesForDocument(documentId: DocumentId): Promise<DocumentScope[]>;

  /**
   * Promote every document in `from` into `to` (idempotent per row).
   * Used by bootstrap-session-scoped-attachment when a draft is
   * confirmed — session-scope rows promote to course-scope while the
   * session rows persist for audit. Source rows are NOT removed.
   */
  promoteScope(input: {
    from: DocumentScope;
    to: DocumentScope;
    source: DocumentScopeSource;
  }): Promise<{ promoted: DocumentId[] }>;
}

// ─── Phase 6: CourseStateReader ───────────────────────────────────────────────

export interface CourseStateReader {
  /**
   * Resolve the active course's current lesson and concept-status map.
   * Returns null when courseId is invalid for this student.
   */
  read(input: { studentId: StudentId; courseId: CourseId }): Promise<CourseStateSnapshot | null>;
}

export interface CourseStateSnapshot {
  course: Course;
  lessons: Lesson[]; // ordered by orderIndex
  currentLesson: Lesson | null; // first non-completed lesson, or null if all done
  /** All concepts touched by the course's lessons, with study status. */
  conceptsByLesson: Map<LessonId, ConceptStateRow[]>;
  /** Quick index for ToolContext consumers. */
  conceptsById: Map<ConceptId, ConceptStateRow>;
  /** Phase 9: Enriched gates for the UI / brief composer. */
  gates: GateView[];
  /** Phase 9: The single "next gate to unlock" — the closest locked gate the student is
   *  currently working toward, or null when nothing locked. */
  activeGate: GateView | null;
  /** Phase 9: Lessons summarized for the bounded visibility window. */
  visibilityWindow: VisibilityWindow;
}

/** Phase 9: Pre-computed bounds for the brief composer's visibility window. */
export interface VisibilityWindow {
  /** Index of the current lesson in the lessons array (or 0 when none started). */
  currentLessonIndex: number;
  /** Number of lessons after the next-lesson detail (i.e. total - currentLessonIndex - 2). */
  remainingCount: number;
}

export interface ConceptStateRow {
  conceptId: ConceptId;
  name: string;
  description: string;
  studied: boolean;
  studiedAt?: Timestamp;
  lessonId: LessonId;
}

// ─── Phase 6: BootstrapService ────────────────────────────────────────────────

/** Issue returned by finalizeDraft validation. */
export interface DraftIssue {
  kind: string;
  message: string;
}

export interface BootstrapService {
  // ── Phase 16: incremental draft mutations ──────────────────────���─────────────

  /** Create an empty draft and return its id. */
  initDraft(input: {
    studentId: StudentId;
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
   * the draft is gone (expired or never existed). Used by the explore agent
   * to surface partial progress to the tutor without forcing a separate
   * "finalize" ritual, and by the tutor's UI to render quick metrics.
   */
  summarize(draftId: string): Promise<DraftSummary | null>;

  // ── Phase 16: unit + assessment scaffold ──────────────────────────────────────

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

  // ── Existing methods ─────────────────────────────────────────────────────────
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

/** One entry in the list returned by `BootstrapService.listUnits`. */
export interface UnitListEntry {
  draftUnitId: string;
  name: string;
  summary?: string;
  lessonCount: number;
  hasSummative: boolean;
}

/** Result of `BootstrapService.listLessonsInUnit`. */
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

/** Result of `BootstrapService.getLessonDetail`. */
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

/** Result of `BootstrapService.listDanglingRefs`. */
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

// ─── Phase 10: PackImportService (port) ──────────────────────────────────────

/** Compact summary of a pack manifest (id, name, subject, concept count, etc.). */
export interface PackSummaryView {
  id: string;
  version: string;
  name: string;
  subject: string;
  gradeLevel: string;
  conceptCount: number;
  edgeCount: number;
  imported: boolean;
}

/** Record of a successfully imported pack. */
export interface ImportedPackView {
  packId: string;
  version: string;
  conceptGraphId: ConceptGraphId;
  importedAt: number;
}

/**
 * Port for pack import + listing operations.
 * Implemented by PackImportServiceImpl in @praxis/curriculum.
 * Exposed to tools via ToolServices.packs.
 */
export interface PackImportService {
  /** List all pack JSON files available in the packs directory. */
  listAvailablePacks(): Promise<PackSummaryView[]>;
  /**
   * Import a pack by its id. Idempotent — re-importing the same version returns
   * the existing record without re-writing DB rows or embeddings.
   */
  importPack(packId: string): Promise<ImportedPackView>;
  /** Return all imported packs (all versions, all subjects). */
  listImportedPacks(): Promise<ImportedPackView[]>;
  /** Find a pack manifest by subject id. */
  findPackBySubject(subject: string): Promise<PackSummaryView | null>;
  /** Return the conceptGraphId for the latest imported version of a pack. */
  getConceptGraphForPack(packId: string): Promise<string | null>;
}

// ─── Phase 18: PedagogyPackService ───────────────────────────────────────────

/**
 * Read-only service over the loaded pedagogy pack. Synchronous accessors —
 * the pack is loaded once at boot and held in memory (~50 KB upper bound for v1).
 * When no pack file is available at runtime, every accessor returns empty arrays
 * or null (empty-pack mode). Implemented by `PedagogyPackServiceImpl` in
 * `@praxis/curriculum/pedagogy`.
 */
export interface PedagogyPackService {
  /** Returns the loaded pack, or `null` if no pack is available at runtime. */
  current(): PedagogyPack | null;

  /** All teaching strategies in the loaded pack (empty if no pack). */
  listStrategies(): readonly TeachingStrategy[];

  /** Lookup a teaching strategy by id. Returns `null` if no pack or unknown id. */
  getStrategy(id: StrategyId): TeachingStrategy | null;

  /** All study techniques in the loaded pack (empty if no pack). */
  listTechniques(): readonly StudyTechnique[];

  /** Lookup a study technique by id. Returns `null` if no pack or unknown id. */
  getTechnique(id: TechniqueId): StudyTechnique | null;

  /**
   * Metacognitive prompts in the loaded pack, optionally filtered by trigger.
   * Returns an empty array if no pack is loaded.
   */
  listMetacognitivePrompts(opts?: {
    trigger?: MetacognitivePromptTrigger;
  }): readonly MetacognitivePrompt[];
}

// ─── Phase 7: MemoryService (server-side) ─────────────────────────────────────
// NOTE: The client-side MemoryService lives in client.ts and has different signatures
// (no studentId — IPC handlers resolve it via getDefaultStudentId). This is the
// server-side interface; MemoryServiceImpl implements this one.

export interface MemoryService {
  studentModel(studentId: StudentId): Promise<StudentModel>;
  misconceptions(studentId: StudentId): Promise<Misconception[]>;
  /** Returns empty defaults in Phase 7; Phase 14 fills. */
  procedural(studentId: StudentId): Promise<ProceduralModel>;
  /** Returns empty defaults in Phase 7; Phase 14 fills. */
  affective(studentId: StudentId): Promise<AffectiveModel>;
  /** Stream episodic events; skips redacted rows. */
  episodic(opts: {
    studentId: StudentId;
    sessionId?: SessionId;
    range?: TimeRange;
  }): AsyncIterable<EpisodicEvent>;
  /** Full snapshot in MemoryExport format. */
  export(studentId: StudentId): Promise<MemoryExport>;
  /**
   * Wipe projection tables; mark episodic rows as redacted.
   * The episodic rows themselves are NOT deleted.
   */
  delete(opts: { studentId: StudentId; confirm: true }): Promise<void>;
  /**
   * Phase 7: apply explicit mastery signals to a concept.
   * Used by the active-path `update_mastery` tool.
   * Same BKT logic as the MasteryIndexer — single source of truth.
   */
  applySignal(opts: {
    studentId: StudentId;
    conceptId: ConceptId;
    signals: import("./memory.js").MasterySignal[];
  }): void;
  /**
   * Phase 7: upsert a misconception row (dedup by studentId+conceptId+errorForm).
   * Used by the active-path `record_misconception` tool.
   * Same logic as the MisconceptionIndexer — single source of truth.
   * Returns the misconception ID (new or existing) and whether it was a merge.
   */
  recordMisconception(opts: {
    studentId: StudentId;
    conceptId: ConceptId;
    description: string;
    errorForm: string;
    remediation: { strategyId: string; rationale: string };
    evidenceEventIds: string[];
  }): { misconceptionId: string; merged: boolean };

  // ── Phase 11: Configurator memory writes ─────────────────────────────────

  /**
   * Reset a concept to initial BKT state ("as if never observed").
   * Upserts student_mastery with BKT priors; clears evidenceJson + lastPracticedAt.
   */
  resetConcept(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    reason: string;
  }): Promise<void>;

  /**
   * Flip a misconception's status to "manually-cleared".
   * Documents when it was cleared (updates lastObservedAt to now).
   */
  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void>;

  /**
   * Export memory snapshot to a JSON file at `targetPath`.
   * Wraps `export()` and serializes Maps to entry arrays.
   * Returns the byte count written.
   */
  exportToFile(input: {
    studentId: StudentId;
    targetPath: string;
  }): Promise<{ ok: true; bytesWritten: number }>;
}

// ─── EmbeddingService ────────────────────────────────────────────────────────

export interface EmbeddingService {
  /** Encode a passage / chunk for storage. */
  embed(text: string): Promise<number[]>;
  /** Encode a question/query for retrieval. Uses model-specific prefix when applicable. */
  embedQuery(query: string): Promise<number[]>;
  /** Batch passage encoding. */
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimension: number;
  readonly modelId: string;
}

// ─── VectorStore ─────────────────────────────────────────────────────────────

export interface VectorStore {
  upsert(input: VectorUpsertInput): Promise<void>;
  upsertBatch(items: ReadonlyArray<VectorUpsertInput>): Promise<void>;
  search(input: VectorSearchInput): Promise<VectorSearchResult[]>;
  deleteByDocumentId(documentId: string): Promise<void>;
}

export interface VectorUpsertInput {
  chunkId: string;
  documentId: string;
  embedding: number[];
  chunkText: string;
  page?: number;
  section?: string;
}

export interface VectorSearchInput {
  embedding: number[];
  topK: number;
  documentIds?: ReadonlyArray<string>;
  /** Section name substring filter (case-insensitive). */
  sectionPattern?: string;
  /** Page range filter (inclusive). */
  pageRange?: { from: number; to: number };
}

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  chunkText: string;
  page?: number;
  section?: string;
  distance: number;
}

// ─── FtsStore ────────────────────────────────────────────────────────────────

export interface FtsStore {
  upsert(input: FtsUpsertInput): Promise<void>;
  upsertBatch(items: ReadonlyArray<FtsUpsertInput>): Promise<void>;
  /** BM25 full-text search. Returns chunks ranked by FTS5's BM25 score. */
  search(input: FtsSearchInput): Promise<FtsSearchResult[]>;
  deleteByDocumentId(documentId: string): Promise<void>;
}

export interface FtsUpsertInput {
  chunkId: string;
  documentId: string;
  chunkText: string;
  section?: string;
  page?: number;
}

export interface FtsSearchInput {
  /** Plain text query. The store internally builds an FTS5 MATCH expression. */
  query: string;
  topK: number;
  documentIds?: ReadonlyArray<string>;
  sectionPattern?: string;
  pageRange?: { from: number; to: number };
}

export interface FtsSearchResult {
  chunkId: string;
  documentId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** BM25 rank score from FTS5 (lower = more relevant; FTS5 returns negative log-prob). */
  score: number;
}

// ─── DocumentsReader ─────────────────────────────────────────────────────────

/** A single document chunk as returned by the reader. */
export interface DocumentChunkRow {
  chunkIndex: number;
  text: string;
  page?: number;
  section?: string;
}

export interface DocumentsReader {
  titlesByIds(ids: ReadonlyArray<string>): Promise<Map<string, string>>;
  /** Fetch the page image bytes if one was saved during vision-tier ingestion. */
  pageImage(input: { documentId: string; page: number }): Promise<Buffer | null>;
  /**
   * Phase 16: Return all chunks for a document, filtered by studentId for
   * ownership verification. Ordered by chunkIndex.
   */
  chunksForDocument(input: { documentId: string; studentId: string }): Promise<DocumentChunkRow[]>;
}

// ─── SymPyService ────────────────────────────────────────────────────────────

export interface SymPyService {
  /**
   * Check whether a proposed value satisfies an equation.
   * Returns the actual solution(s) for context regardless of correctness.
   */
  checkSolution(input: SymPyCheckSolutionInput): Promise<SymPyCheckSolutionResult>;

  /** Solve an equation for one variable; return all solutions (real + complex). */
  solveEquation(input: SymPySolveEquationInput): Promise<SymPySolveEquationResult>;

  /** Algebraic simplification of an expression. */
  simplify(input: SymPySimplifyInput): Promise<SymPySimplifyResult>;

  /** Check whether two expressions are mathematically equivalent. */
  checkEquivalent(input: SymPyCheckEquivalentInput): Promise<SymPyCheckEquivalentResult>;

  /**
   * Parse a LaTeX expression into sympy-canonical form. Returns the parsed
   * sympy expression as a string and a normalized LaTeX rendering. Used by
   * the verification round-trip helper.
   */
  parseLatex(input: SymPyParseLatexInput): Promise<SymPyParseLatexResult>;
}

export interface SymPyCheckSolutionInput {
  /** Equation in standard math notation, e.g. "2*x + 5 = 11" or LaTeX "2x + 5 = 11". */
  equation: string;
  variable: string;
  proposedValue: string;
  /** When true, treat `equation` as LaTeX; otherwise sympy-style infix. Default: false. */
  isLatex?: boolean;
}

export interface SymPyCheckSolutionResult {
  correct: boolean;
  proposedValue: string;
  expectedSolutions: string[];
  /** When the parser couldn't read the input cleanly. */
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPySolveEquationInput {
  equation: string;
  variable: string;
  isLatex?: boolean;
}

export interface SymPySolveEquationResult {
  solutions: string[];
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPySimplifyInput {
  expression: string;
  isLatex?: boolean;
}

export interface SymPySimplifyResult {
  simplified: string;
  /** LaTeX rendering of the simplified form. */
  simplifiedLatex: string;
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPyCheckEquivalentInput {
  expression1: string;
  expression2: string;
  isLatex?: boolean;
}

export interface SymPyCheckEquivalentResult {
  equivalent: boolean;
  /** sympy expression form of (expression1 - expression2) simplified — useful for diagnostics. */
  difference?: string;
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPyParseLatexInput {
  latex: string;
}

export interface SymPyParseLatexResult {
  /** The parsed sympy expression as a string (e.g. "2*x + 5"). */
  sympyExpression: string;
  /** Normalized LaTeX rendering (sympy's LaTeX printer output). */
  normalizedLatex: string;
  parseError?: string;
}

// ─── CodeSandbox ─────────────────────────────────────────────────────────────

/**
 * High-level sandbox port consumed by `code_sandbox` and other tools.
 * Implemented by `CodeSandboxImpl` (a registry of `LanguageSandbox`
 * adapters). Dispatches `input.language` to the matching adapter.
 */
export interface CodeSandbox {
  run(input: CodeSandboxInput): Promise<CodeSandboxResult>;
  /** Languages this sandbox can dispatch — drives the tool's Zod enum. */
  readonly availableLanguages: readonly string[];
}

export interface CodeSandboxInput {
  /**
   * Language identifier. Must be one of `availableLanguages` on the active
   * `CodeSandbox`; the high-level tool's Zod enum is derived from that set,
   * so by the time we get here `language` is already validated.
   */
  language: string;
  code: string;
  /** Optional stdin string. Adapters that don't support stdin ignore it. */
  stdin?: string;
  /** Wall-clock timeout. Default 5000ms; max enforced 30000ms. */
  timeoutMs?: number;
  /** Memory cap in megabytes. Adapters that don't support a cap ignore it. */
  memoryLimitMb?: number;
}

export interface CodeSandboxResult {
  stdout: string;
  stderr: string;
  /** 0 = success; null = killed (timeout or crash); other = explicit exit code. */
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Set when stdout or stderr was truncated to fit the output limit (default 1MB each). */
  truncated?: { stdout: boolean; stderr: boolean };
}

/**
 * Per-language sandbox adapter. Each language Praxis supports gets one.
 * Adapters are constructed in the composition root and handed to
 * `CodeSandboxImpl` as a fixed array. There is no runtime registration.
 *
 * Conventions:
 * - `language` is a stable identifier matching what tools and the agent
 *   speak ("javascript", "python"). Lowercase, no aliases.
 * - `displayName` is for UI / error messages ("JavaScript", "Python").
 * - `supportsStdin` advertises whether `run({ stdin })` is meaningful.
 *   Adapters that return false MUST ignore (not throw on) stdin input.
 * - `run` resolves with a normalized result. Adapters never throw for
 *   guest-code errors or timeouts — those become fields on the result.
 *   They MAY throw for adapter-internal failures (engine init failures,
 *   invariant violations) — `CodeSandboxImpl` translates those into a
 *   result with `exitCode: null` and the error in `stderr`.
 */
export interface LanguageSandbox {
  readonly language: string;
  readonly displayName: string;
  readonly supportsStdin: boolean;
  run(opts: LanguageSandboxRunOptions): Promise<LanguageSandboxRunResult>;
}

export interface LanguageSandboxRunOptions {
  code: string;
  /** Effective wall-clock timeout (already clamped by `CodeSandboxImpl`). */
  timeoutMs: number;
  /** Effective memory cap MB (clamped by `CodeSandboxImpl`); ignored by some adapters. */
  memoryLimitMb: number;
  /** Already-vetted stdin string; only passed when `supportsStdin === true`. */
  stdin?: string;
  /** Max bytes captured per stream. Default 1_000_000. */
  outputLimitBytes?: number;
}

export interface LanguageSandboxRunResult {
  stdout: string;
  stderr: string;
  /** 0 = success; null = killed (timeout / crash); other = explicit exit code. */
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  truncated: { stdout: boolean; stderr: boolean };
  /** Caught error from guest code (uncaught exception). Distinct from timeout. */
  guestError?: string;
}

// ─── Phase 8: AssignmentService (server-side) ─────────────────────────────────
// NOTE: The client-side AssignmentsClient lives in @praxis/client/services/assignments-client.ts
// and is added by Agent 2. This is the server-side interface; AssignmentServiceImpl implements this.

export interface AssignmentService {
  create(input: {
    courseId: CourseId;
    studentId: StudentId;
    kind: "quiz" | "homework" | "exam";
    title: string;
    items: AssignmentItem[];
    conceptIds: ConceptId[];
    authoredBy?: "tutor" | "configurator";
    /**
     * Phase 16: session that authored this assignment via assignment.create tool.
     * When set, `submit()` will notify this session with a system_note after grading.
     */
    parentSessionId?: SessionId;
  }): Promise<{ assignmentId: AssignmentId }>;

  get(input: { assignmentId: AssignmentId }): Promise<Assignment | null>;

  /** List assignments for a course; useful for course-detail views. */
  list(input: { courseId: CourseId; kind?: "quiz" | "homework" | "exam" }): Promise<Assignment[]>;

  /** Auto-save partial response for a single item. Idempotent upsert. */
  recordResponse(input: {
    assignmentId: AssignmentId;
    itemId: string;
    response: string;
    /** Optional shown work; only meaningful for items with workRubric. */
    work?: string;
  }): Promise<void>;

  /** Read all in-progress responses for an assignment (for resume). */
  getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]>;

  /**
   * Submit the assignment for grading. Reads the persisted responses (or
   * accepts an explicit array), runs the grader dispatch per item, builds
   * the Grade, persists `submittedAt` + `gradeJson`, and returns the result.
   * Throws if already submitted.
   */
  submit(input: {
    assignmentId: AssignmentId;
    /** Optional explicit responses (overrides the persisted ones). */
    responses?: AssignmentResponse[];
  }): Promise<AssignmentSubmissionResult>;
}
