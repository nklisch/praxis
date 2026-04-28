import type { ConceptMapDrawing, Course, DraftCourse, Flashcard, Gate, Note } from "./artifacts.js";
import type { TimeRange, Timestamp } from "./common.js";
import type { EngineEvent } from "./engine.js";
import type { ConceptId, CourseId, GateId, SessionId, StudentId } from "./ids.js";
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
}

export interface SessionService {
  start(opts: { courseId: CourseId; modeId: string }): Promise<SessionHandle>;
  send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent>;
  end(sessionId: SessionId): Promise<SessionSummary>;
  active(): Promise<SessionHandle | null>;
}

export interface SessionHandle {
  sessionId: SessionId;
  courseId: CourseId;
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

export interface ConfigService {
  isLocked(): Promise<boolean>;
  setLockCode(code: string): Promise<void>;
  unlock(code: string): Promise<{ ok: boolean }>;
  selectedEngine(): Promise<string>;
  setSelectedEngine(engineId: string): Promise<void>;
}
