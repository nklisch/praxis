import type { z } from "zod";
import type {
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
import type { SketchService } from "./sketches.js";
import type { VisionDescribeRequest, VisionDescribeResponse } from "./engine.js";

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
  pedagogyPack: unknown; // PedagogyPackService — concrete in Phase 14
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
  /** Phase 6: list ingested documents for bootstrap's list_documents tool. */
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

export interface BootstrapService {
  proposeDraft(
    input: ProposeDraftInput,
  ): Promise<{ draft: DraftCourseState; summary: DraftSummary }>;
  showDraft(draftId: string): Promise<DraftCourseState | null>;
  editDraft(input: { draftId: string; op: DraftEditOp }): Promise<DraftCourseState>;
  confirmDraft(input: {
    draftId: string;
    studentId: StudentId;
  }): Promise<{ courseId: CourseId; lessonIds: LessonId[]; conceptGraphId: string }>;
  discardDraft(draftId: string): Promise<void>;
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

export interface ProposeDraftInput {
  studentId: StudentId;
  documentIds: DocumentId[];
  courseTitle: string;
  subject: string;
  gradeLevel: string;
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

export interface DocumentsReader {
  titlesByIds(ids: ReadonlyArray<string>): Promise<Map<string, string>>;
  /** Fetch the page image bytes if one was saved during vision-tier ingestion. */
  pageImage(input: { documentId: string; page: number }): Promise<Buffer | null>;
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

export interface CodeSandbox {
  run(input: CodeSandboxInput): Promise<CodeSandboxResult>;
}

export interface CodeSandboxInput {
  language: "javascript" | "python";
  code: string;
  /** Optional stdin string. Only meaningful for Python; ignored for JS. */
  stdin?: string;
  /** Wall-clock timeout. Default: 5000ms. Max enforced: 30000ms. */
  timeoutMs?: number;
  /** Memory cap for JS (isolated-vm). Default 128MB. Ignored for Python. */
  memoryLimitMb?: number;
}

export interface CodeSandboxResult {
  stdout: string;
  stderr: string;
  /** 0 = success; null = killed (timeout or crash); other = explicit exit code (rare). */
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Set when stdout or stderr was truncated to fit the output limit (default 1MB each). */
  truncated?: { stdout: boolean; stderr: boolean };
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
