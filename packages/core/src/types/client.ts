import type {
  Assignment,
  AssignmentResponse,
  AssignmentSubmissionResult,
  ConceptMapDrawing,
  Course,
  CourseSummary,
  DraftCourse,
  Flashcard,
  Gate,
  Lesson,
  Note,
} from "./artifacts.js";
import type { TimeRange, Timestamp } from "./common.js";
import type { EngineEvent } from "./engine.js";
import type { AssignmentId, ConceptId, CourseId, GateId, SessionId, StudentId } from "./ids.js";
import type { IngestionEvent, IngestionRequest } from "./ingestion.js";
import type {
  AffectiveModel,
  EpisodicEvent,
  MemoryExport,
  Misconception,
  ProceduralModel,
  StudentModel,
} from "./memory.js";

export interface PraxisClient {
  session: SessionService;
  artifacts: ArtifactsClientSurface;
  author: AuthoringService;
  memory: MemoryService;
  config: ConfigService;
  ingest: IngestionClient;
  documents: DocumentsClient;
  /** Phase 8: assignment lifecycle — create, submit, read grade. */
  assignments: AssignmentsClient;
}

export interface SessionService {
  // courseId is optional in Phase 3 (no courses yet).
  start(opts: {
    courseId?: CourseId;
    /** Phase 8: bind an assignment to this session. Persisted on sessions.assignment_id. */
    assignmentId?: AssignmentId;
    modeId: string;
  }): Promise<SessionHandle>;
  send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent>;
  end(sessionId: SessionId): Promise<SessionSummary>;
  active(): Promise<SessionHandle | null>;
}

export interface SessionHandle {
  sessionId: SessionId;
  courseId?: CourseId; // optional per above
  /** Phase 8: the assignment this session is bound to (quiz/homework/exam sessions). */
  assignmentId?: AssignmentId;
  modeId: string;
  startedAt: Timestamp;
}

// ─── Phase 8: AssignmentsClient (client-side) ────────────────────────────────

/**
 * Client-side interface for the assignments IPC surface.
 * The server-side AssignmentService lives in tool.ts; this is the
 * thin client wrapper over praxis.assignments.* IPC channels.
 */
export interface AssignmentsClient {
  get(input: { assignmentId: AssignmentId }): Promise<Assignment | null>;
  list(input: { courseId: CourseId; kind?: "quiz" | "homework" | "exam" }): Promise<Assignment[]>;
  recordResponse(input: {
    assignmentId: AssignmentId;
    itemId: string;
    response: string;
    work?: string;
  }): Promise<void>;
  getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]>;
  submit(input: { assignmentId: AssignmentId }): Promise<AssignmentSubmissionResult>;
}

export interface SessionSummary {
  sessionId: SessionId;
  endedAt: Timestamp;
  unlockedGates: GateId[];
  newMisconceptions: number;
  reflection?: string;
}

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
  gates(courseId: CourseId): Promise<Gate[]>;
  progress(): Promise<ProgressSnapshot>;
  flashcards(opts?: { conceptId?: ConceptId; due?: boolean }): Promise<Flashcard[]>;
  notes(opts?: { courseId?: CourseId }): Promise<Note[]>;
  conceptMaps(courseId?: CourseId): Promise<ConceptMapDrawing[]>;
}

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

export interface AuthoringService {
  createCourse(input: CreateCourseInput): Promise<Course>;
  editGate(id: GateId, patch: Partial<Gate>): Promise<Gate>;
  bootstrap(files: FileRef[], opts: BootstrapOpts): Promise<DraftCourse>;
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;
}

export interface CreateCourseInput {
  title: string;
  subject: string;
  gradeLevel: string;
  authorRole: "parent" | "teacher" | "self-directed";
}

export interface FileRef {
  path: string;
  filename: string;
  mimeType: string;
}

export interface BootstrapOpts {
  courseTitle: string;
  subject: string;
  gradeLevel: string;
}

export interface MemoryService {
  studentModel(): Promise<StudentModel>;
  misconceptions(): Promise<Misconception[]>;
  procedural(): Promise<ProceduralModel>;
  affective(): Promise<AffectiveModel>;
  episodic(opts: { sessionId?: SessionId; range?: TimeRange }): AsyncIterable<EpisodicEvent>;
  export(): Promise<MemoryExport>;
  delete(opts: { confirm: true }): Promise<void>;
}

/**
 * Snapshot view of EngineConfig for the client surface. Mirrors EngineConfig
 * in @praxis/core/config without forcing client.ts to reach into other core
 * subfolders for a Zod-derived type. SessionServiceImpl validates against
 * EngineConfigSchema before persisting.
 */
export interface EngineConfigSnapshot {
  engineId: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  effort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface ConfigService {
  isLocked(): Promise<boolean>;
  setLockCode(code: string): Promise<void>;
  unlock(code: string): Promise<{ ok: boolean }>;
  selectedEngine(): Promise<string>;
  setSelectedEngine(engineId: string): Promise<void>;
  // Phase 3 additions:
  engineConfig(): Promise<EngineConfigSnapshot>;
  setEngineConfig(config: EngineConfigSnapshot): Promise<void>;
}

// ─── Phase 5: Ingestion + Documents ──────────────────────────────────────────

export interface DocumentSummary {
  documentId: string;
  filename: string;
  mimeType: string;
  ingestorId: string;
  ingestorLabel: string;
  chunkCount: number;
  /** ISO-8601 string. */
  createdAt: string;
  /** Whether page images were saved (vision-tier ingestion only). */
  hasPageImages: boolean;
}

export interface IngestionClient {
  /** Open a native file picker. Returns the selected file path, or null if cancelled. */
  pickFile(): Promise<string | null>;
  /** Begin ingestion. Yields progress events until done or error. */
  start(req: IngestionRequest): AsyncIterable<IngestionEvent>;
  /** Whether the ingestion IPC channel is available in this context. */
  isAvailable(): boolean;
}

export interface DocumentsClient {
  list(): Promise<DocumentSummary[]>;
  delete(documentId: string): Promise<void>;
  /** Fetch the PNG bytes for a saved page render. Returns null if not available. */
  pageImage(input: { documentId: string; page: number }): Promise<Buffer | null>;
}
