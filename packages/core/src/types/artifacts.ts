import type { Citation, Timestamp, TldrawSnapshot } from "./common.js";
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
}

export interface AssignmentItem {
  id: string;
  kind: "multiple-choice" | "short-answer" | "free-response" | "math" | "code";
  prompt: string;
  options?: string[];
  rubric?: Rubric;
}

export interface Rubric {
  criteria: Array<{ id: string; description: string; weight: number }>;
  maxScore: number;
}

export interface Grade {
  total: number;
  perItem: Array<{ itemId: string; score: number; feedback: string }>;
  rubricUsed?: Rubric;
  reviewedBy: "tool" | "rubric-agent" | "needs-human-review";
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

// Re-exported for use in other modules — Citation is used in pedagogy types
export type { Citation };
