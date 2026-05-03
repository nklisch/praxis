import type { Timestamp, TldrawSnapshot } from "./common.js";
import type {
  AssignmentId,
  ConceptGraphId,
  ConceptId,
  ConceptMapId,
  ConfiguratorId,
  CourseId,
  DocumentId,
  FlashcardId,
  GateId,
  GradeBand,
  LessonId,
  NoteId,
  StrategyId,
  StudentId,
  SubjectId,
  SubjectPackId,
  TopicId,
} from "./ids.js";

export interface Course {
  id: CourseId;
  studentId: StudentId;
  title: string;
  subject: SubjectId;
  gradeLevel: GradeBand;
  source: CourseSource;
  lessons: LessonId[];
  conceptGraphId: ConceptGraphId;
  gates: GateId[];
  thresholds: ThresholdConfig;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CourseSource =
  | { kind: "authored"; authorRole: "parent" | "teacher" | "self-directed" }
  | { kind: "bootstrapped"; sourceMaterials: DocumentId[] }
  | { kind: "imported"; pack: SubjectPackId };

export interface ThresholdConfig {
  conceptMastery: number;
  examPass: number;
  allowRetake: boolean;
  decayDays: number;
}

export interface Lesson {
  id: LessonId;
  courseId: CourseId;
  title: string;
  conceptIds: ConceptId[];
  references: Reference[];
  suggestedStrategy: StrategyId;
  estimatedMinutes: number;
}

export interface Reference {
  kind: "textbook" | "url" | "video" | "note";
  source: string;
  locator?: { page?: number; section?: string; timestamp?: number };
}

export interface Assignment {
  id: AssignmentId;
  courseId: CourseId;
  kind: "quiz" | "homework" | "exam";
  title: string;
  items: AssignmentItem[];
  conceptIds: ConceptId[];
  assignedAt: Timestamp;
  submittedAt?: Timestamp;
  grade?: Grade;
  /** Phase 9: retake chain. Points to the original assignment when this is a retake. */
  retakeOf?: AssignmentId;
}

/** Tier the per-item grader returned. Used in GradeItem for traceability. */
export type GraderTier = "deterministic" | "rubric-agent" | "needs-human-review";

/**
 * Rubric — extended with per-criterion calibration anchors.
 * Criterion weights sum to 1.0 (validated at item-create).
 * Criterion scores are 0-10 integers (the agent's per-criterion judgment scale);
 * the aggregated GradeItem.score is 0..1 (deterministic weighted sum).
 */
export interface Rubric {
  criteria: Array<{
    id: string;
    description: string;
    /** 0..1; sums to 1.0 across criteria. */
    weight: number;
    /** Optional anchor descriptions at specific score points (helps agent calibrate). */
    anchors?: Array<{
      /** 0, 5, 10 typical. */
      score: number;
      description: string;
    }>;
  }>;
  /** For display only ("scored 17/20"). Internal scores normalize to 0..1. */
  maxScore: number;
}

/**
 * Extended AssignmentItem — adds grader-specific fields. Each kind has its
 * own optional fields; all may be undefined for items where the kind doesn't
 * use them. The grader dispatch reads only the fields its kind cares about.
 */
export interface AssignmentItem {
  id: string;
  kind: "multiple-choice" | "short-answer" | "free-response" | "math" | "code";
  prompt: string;
  /** For multiple-choice. */
  options?: string[];
  correctOptionIndex?: number;
  /** For short-answer. */
  acceptedAnswers?: string[];
  acceptedAnswerMatch?: "exact" | "substring" | "normalized";
  /** For math. */
  expectedSolution?: { variable: string; value: string };
  /** For code. */
  testCases?: Array<{
    stdin?: string;
    expectedStdout: string;
    timeoutMs?: number;
  }>;
  language?: "javascript" | "python";
  /** For free-response (rubric agent). Required for exam-mode free-response items. */
  rubric?: Rubric;
  /**
   * Phase 8: optional rubric for grading the WORK shown on math/code items.
   * When present, the student earns partial credit for valid steps even if the
   * deterministic check fails.
   */
  workRubric?: Rubric;
  /**
   * When workRubric is present, how much weight the deterministic check gets in
   * the blended score. Range 0..1. Defaults: 0.5 for quiz/homework, 1.0 for exam.
   * Ignored when workRubric is absent.
   */
  primaryWeight?: number;
  /** Provenance — Phase 11 forward-compat. */
  authoredBy?: "tutor" | "configurator";
}

/** Per-item entry on the Grade. */
export interface GradeItem {
  itemId: string;
  /** 0..1; null when ungradeable (e.g. exam free-response missing required rubric). */
  score: number | null;
  feedback: string;
  /** Tier of the grader that produced this entry. */
  gradedBy: GraderTier;
  /**
   * Per-criterion breakdown when a rubric was involved (free-response or workRubric).
   * Each entry's `score` is the agent's 0-10 integer judgment; the `source` field
   * tells the UI which rubric the score relates to.
   */
  perCriterion?: Array<{
    criterionId: string;
    /** 0-10 integer (the agent's native scale). */
    score: number;
    rationale: string;
    /** Which rubric this criterion came from. */
    source: "rubric" | "work-rubric";
  }>;
  /** Episodic event ids of any LLM calls that contributed to this grade. */
  evidenceEventIds?: string[];
}

export interface Grade {
  total: number;
  perItem: GradeItem[];
  rubricUsed?: Rubric;
  /** Highest tier present in perItem. */
  reviewedBy: GraderTier;
}

/** Per-item draft response for resumable assignments. */
export interface AssignmentResponse {
  assignmentId: AssignmentId;
  itemId: string;
  /**
   * Final answer / primary response. For MC: the option index as string.
   * For math/code/free-response/short-answer: the answer text. Always present.
   */
  response: string;
  /**
   * Phase 8: shown work for items that have a workRubric. Only present when
   * the item has a workRubric set; absent otherwise.
   */
  work?: string;
  /**
   * Phase 15a: optional sketch reference. When set, the response was submitted
   * with a drawing in the inline canvas; agent grading can fetch the sketch
   * via `sketch.read({ sketchId })` or via `grade_math({ kind: "sketch", sketchId })`.
   */
  sketchId?: string;
  recordedAt: Timestamp;
}

/** Result of submitting an assignment. Returned by AssignmentService.submit. */
export interface AssignmentSubmissionResult {
  assignmentId: AssignmentId;
  grade: Grade;
  submittedAt: Timestamp;
}

export interface Gate {
  id: GateId;
  courseId: CourseId;
  guards: GateTarget;
  prerequisites: GateId[];
  successCriteria: SuccessCriteria;
  state: GateState;
  evidence: EvidenceRef[];
}

export type GateTarget =
  | { kind: "concept"; conceptId: ConceptId }
  | { kind: "lesson"; lessonId: LessonId }
  | { kind: "topic"; topicId: TopicId }
  | { kind: "course-completion" };

export type SuccessCriteria =
  | { kind: "mastery-threshold"; conceptIds: ConceptId[]; minScore: number }
  | { kind: "exam-pass"; assignmentId: AssignmentId; minScore: number }
  | { kind: "and"; criteria: SuccessCriteria[] }
  | { kind: "or"; criteria: SuccessCriteria[] };

export type GateState =
  | { kind: "locked"; missingPrerequisites: GateId[] }
  | { kind: "unlocked"; unlockedAt: Timestamp; evidence: EvidenceRef[] }
  | { kind: "overridden"; by: ConfiguratorId; reason: string; at: Timestamp };

export interface EvidenceRef {
  kind: "event" | "assignment" | "manual";
  id: string;
}

export interface Flashcard {
  id: FlashcardId;
  studentId: StudentId;
  conceptId?: ConceptId;
  front: string;
  back: string;
  reviewState: ReviewState;
  source: { kind: "authored" | "extracted" | "user-created"; ref?: string };
}

/**
 * Spaced-repetition state. Phase 12 chooses FSRS or SM-2 implementation;
 * the type carries the algorithm-specific fields opaquely as JSON.
 */
export interface ReviewState {
  algorithm: "fsrs" | "sm2";
  state: Record<string, unknown>;
  nextReviewAt?: Timestamp;
  lastReviewedAt?: Timestamp;
}

export interface Note {
  id: NoteId;
  studentId: StudentId;
  context: NoteContext;
  format: "cornell" | "feynman" | "free" | "outline" | "sketch";
  body?: string;
  sketchScene?: TldrawSnapshot;
  links: ArtifactRef[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface NoteContext {
  courseId?: CourseId;
  lessonId?: LessonId;
  sessionId?: string;
  conceptIds?: ConceptId[];
}

export interface ConceptMapDrawing {
  id: ConceptMapId;
  studentId: StudentId;
  courseId?: CourseId;
  scene: TldrawSnapshot;
  conceptLinks: Array<{ elementId: string; conceptId: ConceptId; confidence: number }>;
  divergences?: ConceptMapDivergence[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConceptMapDivergence {
  kind: "missing-edge" | "extra-edge" | "mislabeled-direction" | "missing-concept";
  description: string;
  elementIds: string[];
}

export interface ArtifactRef {
  kind: "course" | "lesson" | "assignment" | "note" | "flashcard" | "concept-map" | "document";
  id: string;
}

export interface DraftCourse {
  course: Course;
  draftLessons: Lesson[];
  proposedConcepts: ProposedConcept[];
  proposedEdges: ProposedEdge[];
  needsConfirmation: true;
}

export interface ProposedConcept {
  name: string;
  description: string;
  evidence: EvidenceRef[];
}

export interface ProposedEdge {
  fromName: string;
  toName: string;
  strength: number;
  rationale: string;
}

export interface DocumentArtifact {
  id: DocumentId;
  studentId: StudentId;
  filename: string;
  mimeType: string;
  ingestedAt: Timestamp;
  manifestJson: Record<string, unknown>; // shape from praxis-ingest
  chunkCount: number;
}

// Note: Citation is re-exported from common.ts via the types/index.ts barrel —
// no explicit re-export needed here.

// ─── Phase 6: Per-student progress ──────────────────────────────────────────

export type LessonProgressStatus = "not_started" | "in_progress" | "completed";

export interface LessonProgress {
  studentId: StudentId;
  lessonId: LessonId;
  status: LessonProgressStatus;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface ConceptProgress {
  studentId: StudentId;
  conceptId: ConceptId;
  studiedAt: Timestamp;
  /** Episodic event IDs that produced this 'studied' marker — for back-reference. */
  evidence: string[];
}

// ─── Phase 6: Bootstrap (extractor output / draft state) ─────────────────────

/**
 * The structured output of the concept-extractor agent. Pre-persistence shape:
 * uses names (not IDs) for concepts and prerequisite edges so the user can
 * rename/reorder freely before confirmation. ConfirmDraft assigns IDs.
 */
export interface ProposedCourse {
  title: string;
  subject: string;
  gradeLevel: string;
  thresholds: ThresholdConfig;
  proposedConcepts: ProposedConcept[];
  proposedEdges: ProposedEdge[];
  proposedLessons: ProposedLesson[];
}

export interface ProposedLesson {
  /** Stable within the draft; reassigned at confirm time. */
  draftLessonId: string;
  title: string;
  /** Names referencing ProposedConcept.name. Order matters within a lesson. */
  conceptNames: string[];
  references: Reference[];
  suggestedStrategy: StrategyId;
  estimatedMinutes: number;
}

/**
 * In-memory draft state held by BootstrapService. Identifies the draft and
 * carries the editable shape the user is iterating on.
 */
export interface DraftCourseState {
  draftId: string;
  studentId: StudentId;
  documentIds: DocumentId[];
  proposed: ProposedCourse;
  createdAt: Timestamp;
  lastTouchedAt: Timestamp;
  expiresAt: Timestamp;
}

/** Compact summary returned by `course.propose_draft` to keep tool output small. */
export interface DraftSummary {
  draftId: string;
  title: string;
  lessonCount: number;
  conceptCount: number;
  edgeCount: number;
  /** First 5 lessons for the agent to narrate. */
  firstLessons: Array<{ title: string; conceptCount: number }>;
}

// ─── Phase 6: Draft edit operations (used by course.edit_draft) ───────────────

export type DraftEditOp =
  | { kind: "rename-course"; title: string }
  | { kind: "rename-lesson"; lessonIndex: number; title: string }
  | { kind: "reorder-lessons"; newOrder: number[] }
  | { kind: "remove-lesson"; lessonIndex: number }
  | { kind: "add-lesson"; afterIndex: number; title: string; conceptNames: string[] }
  | { kind: "rename-concept"; conceptName: string; newName: string }
  | { kind: "remove-concept"; conceptName: string }
  | {
      kind: "add-concept";
      lessonIndex: number;
      name: string;
      description: string;
      afterConceptIndex?: number;
    }
  | { kind: "set-thresholds"; thresholds: ThresholdConfig };

// ─── Phase 6: Course summary (for list views) ─────────────────────────────────

export interface CourseSummary {
  courseId: CourseId;
  title: string;
  subject: string;
  gradeLevel: string;
  lessonCount: number;
  conceptCount: number;
  /** Studied / total — derived from concept_progress. */
  studiedConcepts: number;
  createdAt: Timestamp;
}
