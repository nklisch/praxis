import type { Timestamp, TldrawSnapshot } from "./common.js";
import type { GateView, GradeReader, MasteryReader } from "./gate.js";
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
  LessonAssessmentId,
  LessonId,
  NoteId,
  SessionId,
  StrategyId,
  StudentId,
  SubjectId,
  SubjectPackId,
  TopicId,
  UnitId,
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
  /** Phase 16: optional assessment plan. Null for courses bootstrapped before Phase 16. */
  assessmentPlan?: AssessmentPlan;
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
  /**
   * Optional exam time limit in minutes. Null / undefined for untimed assignments.
   * When set on an exam, the UI renders a countdown and auto-submits at expiry
   * (measured from assignedAt).
   */
  durationMinutes?: number | null;
}

/** Tier the per-item grader returned. Used in GradeItem for traceability. */
export type GraderTier = "deterministic" | "rubric-agent" | "needs-human-review";

// ─── Phase 17: Discriminated AssignmentItem union ─────────────────────────────

export interface SingleChoiceItem {
  kind: "single-choice";
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  /** Phase 17: optional reasoning modifier — student must justify their selection. */
  requireReasoning?: boolean;
  /** Required when requireReasoning is true. */
  reasoningRubric?: Rubric;
  /** Blending weight for deterministic score vs reasoning rubric score. Range 0..1. */
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

export interface MultiSelectItem {
  kind: "multi-select";
  id: string;
  prompt: string;
  options: string[];
  /** One or more correct option indices, sorted ascending. */
  correctOptionIndices: number[];
  requireReasoning?: boolean;
  reasoningRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

export interface ShortAnswerItem {
  kind: "short-answer";
  id: string;
  prompt: string;
  acceptedAnswers: string[];
  acceptedAnswerMatch?: "exact" | "substring" | "normalized";
  authoredBy?: "tutor" | "configurator";
}

export interface FreeResponseItem {
  kind: "free-response";
  id: string;
  prompt: string;
  rubric?: Rubric;
  acceptedAnswers?: string[];
  acceptedAnswerMatch?: "exact" | "substring" | "normalized";
  authoredBy?: "tutor" | "configurator";
}

export interface MathItem {
  kind: "math";
  id: string;
  prompt: string;
  expectedSolution: { variable: string; value: string };
  workRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

export interface CodeItem {
  kind: "code";
  id: string;
  prompt: string;
  language: "javascript" | "python";
  testCases: Array<{
    stdin?: string;
    expectedStdout: string;
    timeoutMs?: number;
  }>;
  workRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

export interface NumericalItem {
  kind: "numerical";
  id: string;
  prompt: string;
  expectedValue: number;
  /** Absolute tolerance: |studentValue - expectedValue| ≤ tolerance. Default 0. */
  tolerance?: number;
  /** Optional units; case-insensitive exact-string match. */
  expectedUnits?: string;
  /** When set, student answer must round to this many significant figures. */
  significantFigures?: number;
  workRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

export interface MatchingItem {
  kind: "matching";
  id: string;
  prompt: string;
  /** Items in the left column, in display order. */
  leftItems: Array<{ id: string; text: string }>;
  /** Items in the right column, in display order. */
  rightItems: Array<{ id: string; text: string }>;
  /** Correct pairs as (leftId, rightId). One-to-one bijection in v1. */
  correctPairs: Array<{ leftId: string; rightId: string }>;
  authoredBy?: "tutor" | "configurator";
}

export interface OrderingItem {
  kind: "ordering";
  id: string;
  prompt: string;
  /** Items shown in shuffled order to the student. Each has a stable id. */
  items: Array<{ id: string; text: string }>;
  /** Correct sequence as an array of item ids. Must be a permutation of items[].id. */
  correctOrder: string[];
  authoredBy?: "tutor" | "configurator";
}

export interface TwoTierItem {
  kind: "two-tier";
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  reasonPrompt: string;
  reasonOptions: string[];
  correctReasonIndex: number;
  /**
   * Maps each reason option index to a misconception id (or null when the
   * option is correct or has no clear misconception). Length must equal
   * reasonOptions.length.
   */
  misconceptionByReasonIndex: Array<string | null>;
  /** Optional free-text reasoning ON TOP of the two-tier structure. */
  requireReasoning?: boolean;
  reasoningRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

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
 * Inline structured-question prompt rendered as a card in the chat.
 * The tutor uses this when it needs the student to make a decision the
 * model can't make on the student's behalf — pack vs textbook,
 * confidence-on-this-topic, branch-here-or-there. Multiple questions
 * in one call (rendered as a stack); each question has its own option
 * list and single-vs-multi-select flag.
 *
 * Not an assessment item — the model doesn't grade the answer; it
 * just acts on it. Reuses AssignmentItem's union to inherit the
 * existing quick-check dispatch pipeline.
 */
export interface StructuredQuestionItem {
  kind: "structured-question";
  /** Tool call id (uuidv7); also used as the React key. */
  id: string;
  questions: Array<{
    /** Very short label shown as a chip / tag (max ~12 chars). */
    header: string;
    /** Full question text shown above the options. */
    prompt: string;
    /** When true, the student can pick more than one option. */
    multiSelect: boolean;
    options: Array<{
      label: string;
      description?: string;
    }>;
  }>;
}

/**
 * Phase 17: AssignmentItem discriminated union. Each kind is a separate
 * interface with only the fields relevant to that kind. The `kind` field is
 * the discriminant.
 *
 * Migration note: the old `"multiple-choice"` kind is renamed to
 * `"single-choice"`. A one-shot migration in drizzle/ rewrites stored JSON.
 */
export type AssignmentItem =
  | SingleChoiceItem
  | MultiSelectItem
  | ShortAnswerItem
  | FreeResponseItem
  | MathItem
  | CodeItem
  | NumericalItem
  | MatchingItem
  | OrderingItem
  | TwoTierItem
  | StructuredQuestionItem;

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
    source: "rubric" | "work-rubric" | "reasoning-rubric";
  }>;
  /** Episodic event ids of any LLM calls that contributed to this grade. */
  evidenceEventIds?: string[];
  /**
   * Phase 17: set when a two-tier item's tier-2 selection maps to a misconception.
   * The assignment service logs this for later misconception-memory wiring.
   */
  misconceptionId?: string;
}

export interface Grade {
  total: number;
  perItem: GradeItem[];
  rubricUsed?: Rubric;
  /** Highest tier present in perItem. */
  reviewedBy: GraderTier;
}

/** Confidence band values captured per item in quiz mode. */
export type ConfidenceBand = "guessed" | "unsure" | "pretty_sure" | "certain";

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
  /**
   * Confidence band — formative self-assessment signal per quiz item.
   * Optional: null/absent when the student did not select a level.
   * Fed to the procedural-memory indexer alongside correctness.
   */
  confidence?: ConfidenceBand;
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
  /** Course the map is anchored to. Required in v1. */
  courseId: CourseId;
  /** Display title, e.g. "whole course", "linear equations". */
  title: string;
  scene: TldrawSnapshot;
  conceptLinks: ConceptLink[];
  divergences?: ConceptMapDivergence[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Link from a tldraw shape id to a canonical concept. */
export interface ConceptLink {
  elementId: string; // tldraw shape id (e.g. "shape:abc123")
  conceptId: ConceptId; // canonical concept this element represents
  /** 0..1 — fuzzy match score from the typeahead, 1.0 if user explicitly linked. */
  confidence: number;
  /**
   * Three-state canonical-link status for this node.
   * - `"linked"`: student confirmed the link (or explicitly selected a candidate).
   * - `"best_guess"`: Praxis's tentative match awaiting student confirmation.
   * - `"unlinked"`: no canonical link (the default before any matching occurs).
   * Optional for backwards compatibility: absent means `"unlinked"` on pre-feature maps.
   */
  linkState?: "linked" | "best_guess" | "unlinked";
  /**
   * Ranked candidates the agent considers for this node. Present when
   * `linkState` is `"best_guess"` or when the typeahead produced alternatives
   * for the student to choose from.
   */
  candidates?: Array<{ canonicalConceptId: ConceptId; confidence: number }>;
}

/**
 * Downstream consequence summary for confirming a single canonical link.
 * Returned by `ConceptMapService.computeRipples` — computed on demand, not cached.
 */
export interface RippleSummary {
  /** Net change in distinct canonical concepts covered by this map after linking. */
  conceptCountDelta: number;
  /** Notes whose `context.conceptIds` tag would change (gain this concept). */
  notesRetagged: number;
  /** Open tutor sessions that reference this concept-map node and would resolve differently. */
  tutorRefsAffected: number;
}

/** A historical snapshot of a concept map. */
export interface ConceptMapVersion {
  id: string; // version row id
  conceptMapId: ConceptMapId;
  scene: TldrawSnapshot;
  conceptLinks: ConceptLink[];
  /** The session this snapshot was captured at end-of. Null for the initial create. */
  sessionId?: SessionId;
  snapshotAt: Timestamp;
}

/** Lightweight list-view summary (omits the heavy `scene` payload). */
export interface ConceptMapSummary {
  readonly id: ConceptMapId;
  readonly studentId: StudentId;
  readonly courseId: CourseId;
  readonly title: string;
  readonly versionCount: number;
  readonly hasDivergences: boolean;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  /** Count of conceptLinks with linkState === "linked". */
  readonly linkedNodeCount: number;
  /** Count of text-bearing shapes in the scene (denominator for coverage %). */
  readonly totalNodeCount: number;
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

// ─── Phase 16: Units, lesson assessments, assessment plan ────────────────────

/**
 * A band of lessons within a course. Courses that predate Phase 16 have no
 * units; the UI defaults to the flat-lesson view when `course.assessmentPlan`
 * is absent.
 */
export interface Unit {
  id: UnitId;
  courseId: CourseId;
  name: string;
  summary?: string;
  orderIndex: number;
  /** Lesson IDs that belong to this unit, in study order. Resolved from lessonUnits join. */
  lessonIds: LessonId[];
  /** Summative assessment (unit exam / midterm) at the end of this unit. Optional. */
  summativeAssignmentId?: AssignmentId;
}

/**
 * Scheduled assessment attached to a specific lesson.
 * The assignment.kind says quiz/homework/exam; purpose says why it's here.
 */
export interface LessonAssessment {
  id: LessonAssessmentId;
  lessonId: LessonId;
  assignmentId: AssignmentId;
  /** When in the lesson flow this assessment runs. */
  timing: "before" | "after" | "interleaved";
  /** Pedagogical role of this assessment. */
  purpose: "readiness" | "practice" | "checkpoint";
}

/**
 * Aggregate description of a course's assessment scaffold. Stored as
 * JSON on the courses row. Written by persistDraft when the drafter produces a
 * plan; immutable after that except via configure-mode.
 */
export interface AssessmentPlan {
  perLesson: {
    /** Whether every lesson gets a homework assignment. */
    homework: boolean;
    /** 0 = no quizzes; N = quiz every Nth lesson. */
    quizFrequency?: number;
  };
  summatives: Array<{
    kind: "midterm" | "unit_exam" | "final";
    /** Exam is placed after the unit with this orderIndex. */
    afterUnitOrderIndex: number;
    title: string;
  }>;
  /** Optional pacing hints for a future calendar-pacing phase. */
  pacing?: { sessionsPerWeek?: number; weeksTotal?: number };
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
  /**
   * Phase 16: proposed unit groupings.
   * Empty array for pre-16 drafters that don't produce unit scaffolding.
   * Defaults to `[]` at call sites; required at persist time if an assessment plan is set.
   */
  proposedUnits?: ProposedUnit[];
  /**
   * Phase 16: per-lesson assessment schedules proposed by the drafter.
   * Each entry maps a lesson to an assessment shell. Empty for pre-16 drafters.
   */
  proposedLessonAssessments?: ProposedLessonAssessmentEntry[];
  /** Phase 16: proposed assessment plan. Optional; absent for pre-16 drafters. */
  assessmentPlan?: AssessmentPlan;
}

/**
 * A per-lesson assessment entry. Binds a ProposedAssessment to a specific
 * lesson in the draft, with timing and purpose metadata.
 */
export interface ProposedLessonAssessmentEntry extends ProposedAssessment {
  /** References `ProposedLesson.draftLessonId`. */
  draftLessonId: string;
  timing: "before" | "after" | "interleaved";
  purpose: "readiness" | "practice" | "checkpoint";
}

/**
 * A unit as proposed by the drafter before IDs are assigned.
 * `draftLessonIds` reference `ProposedLesson.draftLessonId` values within the
 * same `ProposedCourse.proposedLessons` array.
 */
export interface ProposedUnit {
  /** Stable within the draft; resolved to `UnitId` at persist time. */
  draftUnitId: string;
  name: string;
  summary?: string;
  /** References into proposedLessons[].draftLessonId. Order matters. */
  draftLessonIds: string[];
  /** Optional summative assessment scheduled at the end of this unit. */
  summative?: ProposedAssessment;
}

/**
 * An assessment scheduled by the drafter before items are authored.
 * Items are filled in by the tutor or configurator before the student takes it.
 */
export interface ProposedAssessment {
  /** Stable within the draft; resolved to `AssignmentId` at persist time. */
  draftAssessmentId: string;
  kind: "quiz" | "homework" | "exam";
  title: string;
  /** Concept names (not IDs) that this assessment should cover. Resolved at persist time. */
  conceptNames: string[];
  /** Editorial hint for the configurator; how many items to author. */
  expectedItemCount?: number;
  /** Why is this assessment here? What does it test? Used by the configurator as context. */
  rationale: string;
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
 * In-memory draft state held by CourseCreateService. Identifies the draft and
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
  /**
   * Phase 16 (course-create-session-scoped-attachment): the parent course-create
   * session id (S1 — the tutor session that invoked start_drafting, NOT the drafter
   * sub-agent's own session). Stored here so confirmDraft can promote
   * session-scope document rows to course-scope via documentScopes.promoteScope.
   *
   * Optional for backwards compatibility with drafts created before this feature.
   * confirmDraft falls back to the old attachMany path when this is absent.
   */
  sessionId?: SessionId;
}

/** Compact summary returned by `course.start_drafting` to keep tool output small. */
export interface DraftSummary {
  draftId: string;
  title: string;
  lessonCount: number;
  conceptCount: number;
  edgeCount: number;
  /** First 5 lessons for the agent to narrate. */
  firstLessons: Array<{ title: string; conceptCount: number }>;
  /** Phase 16: number of proposed units in the draft (0 for pre-16 drafters). */
  unitCount: number;
  /** Phase 16: total assessment shells scheduled (summatives + per-lesson). */
  assessmentCount: number;
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
  | { kind: "set-thresholds"; thresholds: ThresholdConfig }
  | {
      kind: "relink-concept";
      conceptName: string;
      /** Destination lesson index. -1 to orphan (remove from all lessons without deleting node/edges). */
      lessonIndex: number;
      /** Insert position in destination lesson. Inserts at afterConceptIndex+1, or end if absent. */
      afterConceptIndex?: number;
    }
  | {
      kind: "add-edge";
      fromName: string;
      toName: string;
      /** Edge strength in [0, 1]. */
      strength: number;
      rationale?: string;
    }
  | {
      kind: "remove-unit";
      /** The draftUnitId of the unit to remove. Cascades: also removes lesson memberships within the unit. */
      draftUnitId: string;
    }
  | { kind: "validate-draft" };

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

// ─── Phase 6: ArtifactsService ───────────────────────────────────────────────

export interface DocumentSummaryItem {
  documentId: DocumentId;
  filename: string;
  mimeType: string;
  chunkCount: number;
  hasPageImages: boolean;
}

export interface ArtifactsService {
  course(id: CourseId): Promise<Course | null>;
  courses(studentId: StudentId): Promise<CourseSummary[]>;
  lessons(courseId: CourseId): Promise<Lesson[]>;
  /** Phase 16: Return units for a course, ordered by orderIndex. */
  units(courseId: CourseId): Promise<Unit[]>;
  /** Phase 16: Return scheduled assessments for a single lesson. */
  lessonAssessments(lessonId: LessonId): Promise<LessonAssessment[]>;
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

  // ── Snapshot-restore helpers ─────────────────────────────────────────────
  // These thin upsert methods exist to support restoreAction's reverse-apply
  // path. They restore an artifact to an arbitrary prior shape (including
  // re-creating a previously deleted entity) — the standard create/update/delete
  // trio doesn't cover that case.

  /** Get a single lesson by id. Returns null if not found. */
  getLesson(lessonId: LessonId): Promise<Lesson | null>;

  /** Get a single gate by id. Returns null if not found. */
  getGate(gateId: GateId): Promise<Gate | null>;

  /**
   * Upsert a lesson to an exact prior shape (insert if absent, full-replace if present).
   * Used by restoreAction to handle both re-create-after-delete and overwrite cases.
   */
  upsertLesson(lesson: Lesson): Promise<void>;

  /**
   * Upsert a gate to an exact prior shape (insert if absent, full-replace if present).
   * Used by restoreAction to handle both re-create-after-delete and overwrite cases.
   */
  upsertGate(gate: Gate): Promise<void>;
}

// Re-export gate ports so callers can import from artifacts.ts (was previously exported from tool.ts).
export type { GateView, GradeReader, MasteryReader };

// ─── ProgressSnapshot ────────────────────────────────────────────────────────

export interface ProgressSnapshot {
  studentId: StudentId;
  courseProgress: Array<{
    courseId: CourseId;
    masteredConceptCount: number;
    inProgressConceptCount: number;
    lockedConceptCount: number;
    nextRecommended?: { kind: "lesson" | "quiz" | "review"; id: string };
  }>;
  recentUnlocks: Array<{ gateId: GateId; at: Timestamp }>;
}

// ─── Phase 6: ArtifactsClientSurface ─────────────────────────────────────────

/**
 * Client-side artifacts surface — read-only UI interface.
 * Phase 6: courses() returns CourseSummary[] (cheaper list view);
 * full Course is fetched per-id via course(id). Added lessons(courseId).
 *
 * Note: this is the client-facing interface. The server-side service
 * (ArtifactsService in tool.ts) has studentId parameters since the server
 * handles multi-tenant concerns. The client always operates as the default
 * student (single-student v1).
 */
export interface ArtifactsClientSurface {
  course(id: CourseId): Promise<Course | null>;
  /** Returns summaries for the list view. Full Course fetched per-id via course(id). */
  courses(): Promise<CourseSummary[]>;
  lessons(courseId: CourseId): Promise<Lesson[]>;
  /** Phase 16: Return units for a course, ordered by orderIndex. */
  units(courseId: CourseId): Promise<Unit[]>;
  /** Phase 16: Return scheduled assessments for a single lesson. */
  lessonAssessments(lessonId: LessonId): Promise<LessonAssessment[]>;
  gates(courseId: CourseId): Promise<Gate[]>;
  progress(): Promise<ProgressSnapshot>;
  flashcards(opts?: { conceptId?: ConceptId; due?: boolean }): Promise<Flashcard[]>;
  notes(opts?: { courseId?: CourseId }): Promise<Note[]>;

  /** Phase 9: Enriched gate views for a course (read-only, includes progress %). */
  gateView(courseId: CourseId): Promise<GateView[]>;

  /** Phase 9: Trigger gate evaluation for a course (manual or automated). */
  evaluateGates(courseId: CourseId): Promise<{ unlockedGateIds: GateId[] }>;

  /** Phase 9: Mark all unlock events for a course as viewed (clears badge). */
  markGatesViewed(courseId: CourseId): Promise<void>;

  /** Phase 9: Count of unviewed unlock events for a course. */
  newlyUnlockedCount(courseId: CourseId): Promise<number>;

  /**
   * Phase 10: Return the full concept list for a course.
   * Concept ids are prefixed for canonical packs and UUIDs for extracted courses.
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
}

// ─── Phase 10: PacksClient ────────────────────────────────────────────────────

export interface PackSummaryClient {
  id: string;
  version: string;
  name: string;
  subject: string;
  gradeLevel: string;
  conceptCount: number;
  edgeCount: number;
  imported: boolean;
}

export interface ImportedPackClient {
  packId: string;
  version: string;
  conceptGraphId: string;
  importedAt: number;
}

/**
 * Client-side interface for the packs IPC surface.
 * The server-side PackImportServiceImpl is in @praxis/curriculum/packs.
 */
export interface PacksClient {
  /** List all available pack JSONs in the packs directory. */
  listAvailable(): Promise<PackSummaryClient[]>;
  /** List all imported packs for this install. */
  listImported(): Promise<ImportedPackClient[]>;
  /**
   * Import a pack by its id. Idempotent — re-importing the same version
   * returns the existing record without re-writing DB rows.
   */
  import(packId: string): Promise<ImportedPackClient>;
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
    /** Optional time limit in minutes. Null for untimed. Only meaningful for exam kind. */
    durationMinutes?: number | null;
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
    /** Confidence band — formative self-assessment signal per quiz item. Optional. */
    confidence?: ConfidenceBand;
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
