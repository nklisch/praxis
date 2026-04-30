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
  Gate,
  Lesson,
} from "./artifacts.js";
import type { ProgressSnapshot } from "./client.js";
import type { Logger, TimeRange, Timestamp } from "./common.js";
import type {
  AssignmentId,
  ConceptId,
  CourseId,
  DocumentId,
  LessonId,
  SessionId,
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
  pedagogyPack: unknown; // PedagogyPackService — concrete in Phase 14
}

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
}

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
