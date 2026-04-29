import type { ConceptMapDrawing, Course, DraftCourse, Flashcard, Gate, Note } from "./artifacts.js";
import type { TimeRange, Timestamp } from "./common.js";
import type { EngineEvent } from "./engine.js";
import type { ConceptId, CourseId, GateId, SessionId, StudentId } from "./ids.js";
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
  artifacts: ArtifactsService;
  author: AuthoringService;
  memory: MemoryService;
  config: ConfigService;
  ingest: IngestionClient;
  documents: DocumentsClient;
}

export interface SessionService {
  // courseId is optional in Phase 3 (no courses yet).
  start(opts: { courseId?: CourseId; modeId: string }): Promise<SessionHandle>;
  send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent>;
  end(sessionId: SessionId): Promise<SessionSummary>;
  active(): Promise<SessionHandle | null>;
}

export interface SessionHandle {
  sessionId: SessionId;
  courseId?: CourseId; // optional per above
  modeId: string;
  startedAt: Timestamp;
}

export interface SessionSummary {
  sessionId: SessionId;
  endedAt: Timestamp;
  unlockedGates: GateId[];
  newMisconceptions: number;
  reflection?: string;
}

export interface ArtifactsService {
  course(id: CourseId): Promise<Course>;
  courses(): Promise<Course[]>;
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
