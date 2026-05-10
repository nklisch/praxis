import type { ClaudeAuthService } from "../services/claude-auth.js";
import type { UpdateCheckResult } from "../services/update-service.js";
import type { ActivityClient } from "./activity.js";
import type {
  Assignment,
  AssignmentResponse,
  AssignmentSubmissionResult,
  ConceptLink,
  ConceptMapDrawing,
  ConceptMapSummary,
  ConceptMapVersion,
  Course,
  CourseSummary,
  DraftCourse,
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
import type { TimeRange, Timestamp, TldrawSnapshot } from "./common.js";
import type { ConfiguratorActionRow } from "./configurator.js";
import type { DraftStreamClient } from "./draft-stream.js";
import type { EngineEvent } from "./engine.js";
import type { Rating } from "./flashcards.js";
import type { GateView } from "./gate.js";
import type {
  AssignmentId,
  ConceptId,
  ConceptMapId,
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
import type { IngestionEvent, IngestionRequest } from "./ingestion.js";
import type {
  AffectiveModel,
  EpisodicEvent,
  MemoryExport,
  Misconception,
  ProceduralModel,
  StudentModel,
} from "./memory.js";
import type { NoteBody } from "./notes.js";
import type { QuickCheckAnswer, QuickCheckEvent } from "./quick-check.js";
import type { SketchId, SketchSummary } from "./sketches.js";
import type { TabId, TabSummary } from "./tabs.js";
import type { DocumentSummaryItem } from "./tool.js";

export interface PraxisClient {
  session: SessionService;
  artifacts: ArtifactsClientSurface;
  author: AuthoringClient;
  memory: MemoryService;
  config: ConfigService;
  ingest: IngestionClient;
  documents: DocumentsClient;
  /** Phase 8: assignment lifecycle — create, submit, read grade. */
  assignments: AssignmentsClient;
  /** Phase 10: canonical knowledge packs — list, import. */
  packs: PacksClient;
  /** Phase 11: local lock code gate. Optional until Agent 2 wires the IPC handler. */
  lock?: LockClient;
  /** Phase 12: notes management — create, update, list, delete, get. */
  notes: NotesClient;
  /** Phase 12: flashcard management + FSRS review. */
  flashcards: FlashcardsClient;
  /** Claude CLI authentication — status check and login flow. */
  claudeAuth: ClaudeAuthService;
  /** Shell helpers — open URLs in the system browser. */
  shell: ShellClient;
  /** Phase 14: tab strip — open, close, rename, list. */
  tabs: TabsClientApi;
  /** Phase 15a: sketch storage + retrieval (renderer-side; uses Blob not Buffer). */
  sketches: SketchClientApi;
  /** Phase 15b: concept map CRUD + versioning. */
  conceptMaps: ConceptMapClientApi;
  /** Phase 16: course ↔ document attachment — attach, detach, list. */
  courseDocuments: CourseDocumentsClientApi;
  /** Activity rail — subscribe to ambient progress events from long-running work. */
  activity: ActivityClient;
  /**
   * Bootstrap-mode live draft stream. Yields snapshot + per-mutation events as
   * the explore agent builds a course outline. The bootstrap tab body
   * subscribes to render the right-pane outline live.
   */
  drafts: DraftStreamClient;
  /** Phase 17: quick check — subscribe to inline question events; resolve student answers. */
  quickCheck: QuickCheckClientApi;
  /** Phase 19: manual-download update check (env-var-gated; no-op when not configured). */
  update: UpdateClientApi;
}

/**
 * Phase 17: Client-side quick check API.
 * The renderer subscribes to `events()` to know when a quick check is pending,
 * and calls `resolve()` when the student submits an answer.
 */
export interface QuickCheckClientApi {
  events(): AsyncIterable<QuickCheckEvent>;
  resolve(input: { callId: string; answer: QuickCheckAnswer }): Promise<void>;
}

/**
 * Client-facing tabs API. Differs from the server-side TabsService by dropping
 * the `studentId` parameters — the server resolves the active student from
 * the IPC context. Client code stays clean: `client.tabs.listOpen()` not
 * `client.tabs.listOpen(brandId<"StudentId">("") as StudentId)`.
 */
export interface TabsClientApi {
  listOpen(): Promise<TabSummary[]>;
  list(opts?: { limit?: number; includeClosed?: boolean }): Promise<TabSummary[]>;
  get(tabId: TabId): Promise<TabSummary | null>;
  open(input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary>;
  reopen(tabId: TabId): Promise<TabSummary>;
  close(tabId: TabId): Promise<void>;
  touch(tabId: TabId): Promise<void>;
  rename(tabId: TabId, title: string): Promise<TabSummary>;
}

/** Generic shell utility surface for the renderer. */
export interface ShellClient {
  openExternal(url: string): Promise<void>;
}

/**
 * Phase 15a: Client-facing sketch API. Uses Blob (not Buffer) for the image
 * so it works in the renderer context (Electron renderer / browser).
 *
 * The server-side SketchService uses Buffer; the IPC layer encodes/decodes via
 * base64 to bridge the boundary.
 */
export interface SketchClientApi {
  /**
   * Upload a sketch. Idempotent — identical snapshot JSON returns the same id.
   * `image` is a PNG Blob from `editor.toImage()` in the renderer.
   */
  put(input: {
    snapshot: unknown;
    image: Blob;
    width: number;
    height: number;
  }): Promise<SketchSummary>;

  /**
   * Fetch the full sketch (snapshot + image). The image is returned as a Blob
   * suitable for `URL.createObjectURL()` or `<img src>`.
   */
  get(
    sketchId: SketchId,
  ): Promise<{ snapshot: unknown; image: Blob; width: number; height: number }>;

  /** Fetch summary metadata only (no image). Returns null if id is unknown. */
  getSummary(sketchId: SketchId): Promise<SketchSummary | null>;
}

/**
 * Phase 15b: Client-facing concept map API. Drops `studentId` — server resolves
 * the active student from the single-student v1 install context.
 */
export interface ConceptMapClientApi {
  create(input: { courseId: CourseId; title: string }): Promise<ConceptMapDrawing>;
  get(id: ConceptMapId): Promise<ConceptMapDrawing | null>;
  list(input: { courseId: CourseId }): Promise<ConceptMapSummary[]>;
  rename(id: ConceptMapId, title: string): Promise<ConceptMapDrawing>;
  delete(id: ConceptMapId): Promise<void>;
  updateScene(input: {
    id: ConceptMapId;
    scene: TldrawSnapshot;
    conceptLinks: ConceptLink[];
  }): Promise<ConceptMapDrawing>;
  listVersions(id: ConceptMapId): Promise<ConceptMapVersion[]>;
}

/**
 * Phase 16: Client-facing course ↔ document attachment API.
 * The studentId is resolved server-side from the single-student v1 install context.
 */
export interface CourseDocumentsClientApi {
  /**
   * List all documents attached to a course, as compact summaries.
   * Returns an empty array when no documents are attached.
   */
  listForCourse(courseId: CourseId): Promise<DocumentSummaryItem[]>;

  /**
   * Attach a library document to a course. Idempotent — re-attaching an
   * already-attached document returns `{ attached: false }`.
   */
  attach(input: {
    courseId: CourseId;
    documentId: DocumentId;
    source?: "manual" | "bootstrap" | "ingestion";
  }): Promise<{ attached: boolean }>;

  /**
   * Detach a document from a course. Idempotent — detaching an unlinked doc
   * returns `{ detached: false }`.
   */
  detach(input: { courseId: CourseId; documentId: DocumentId }): Promise<{ detached: boolean }>;
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
  end(sessionId: SessionId): Promise<SessionEndSummary>;
  active(): Promise<SessionHandle | null>;
  /**
   * Phase 14: List sessions for the student, ordered by startedAt descending.
   * Used by the Library archive section and tab-restoration logic.
   *
   * @param opts.includeEnded - when true, includes sessions with endedAt set. Default true.
   * @param opts.limit - default 100.
   */
  list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]>;
  /**
   * Phase 16: open a child session bound to an assignment, deriving the mode
   * from the assignment's kind. The child session's parentSessionId is set to
   * `parentSessionId` so tabs can link back to the tutor session.
   */
  spawnFromAssignment(input: {
    assignmentId: AssignmentId;
    parentSessionId: SessionId;
  }): Promise<SessionHandle>;
}

export interface SessionHandle {
  sessionId: SessionId;
  courseId?: CourseId; // optional per above
  /** Phase 8: the assignment this session is bound to (quiz/homework/exam sessions). */
  assignmentId?: AssignmentId;
  modeId: string;
  startedAt: Timestamp;
  /**
   * Phase 16: the teach-mode session that spawned this child session.
   * Set when this session was opened via `spawnFromAssignment`.
   */
  parentSessionId?: SessionId;
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
    /** Phase 15a: optional sketch attached to this response. */
    sketchId?: string;
  }): Promise<void>;
  getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]>;
  submit(input: { assignmentId: AssignmentId }): Promise<AssignmentSubmissionResult>;
}

/**
 * Returned by `session.end()` — contains gate unlock results and end metadata.
 * Renamed from SessionSummary in Phase 14 to avoid collision with the list-view type.
 */
export interface SessionEndSummary {
  sessionId: SessionId;
  endedAt: Timestamp;
  unlockedGates: GateId[];
  newMisconceptions: number;
  reflection?: string;
}

/**
 * Phase 14: Lightweight session summary for `session.list()` and the Library archive.
 * Distinct from SessionEndSummary (the end-of-session result from `session.end()`).
 */
export interface SessionSummary {
  readonly sessionId: SessionId;
  readonly modeId: string;
  readonly courseId?: CourseId;
  readonly assignmentId?: AssignmentId;
  readonly startedAt: Timestamp;
  /** Null when the session is still open. */
  readonly endedAt: Timestamp | null;
  /** First user message, truncated to 60 chars + ellipsis if longer. Used as a deck line in Library. */
  readonly firstUserMessage?: string;
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

/**
 * Client-side authoring surface (no studentId on methods — resolved server-side
 * via getOrCreateDefaultStudentId in IPC handlers).
 *
 * Phase 3 methods kept for backward compatibility; Phase 11 adds the full v1 surface.
 */
export interface AuthoringClient {
  // ── Phase 3 surface (now real) ────────────────────────────────────────────
  createCourse(input: CreateCourseInput): Promise<Course>;
  editGate(id: GateId, patch: Partial<Gate>): Promise<Gate>;
  bootstrap(files: FileRef[], opts: BootstrapOpts): Promise<DraftCourse>;
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;

  // ── Phase 11: course / lesson / gate edits ────────────────────────────────
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

  // ── Phase 11: prompt customization ───────────────────────────────────────
  clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void>;
  setStyleSliders(input: { socratic: number; verbosity: number; formality: number }): Promise<void>;

  // ── Phase 11: memory administration (no studentId — resolved server-side) ─
  resetConcept(input: { conceptId: ConceptId; reason: string }): Promise<void>;
  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void>;
  exportMemory(input: { targetPath: string }): Promise<{ ok: true; bytesWritten: number }>;
  deleteAllMemory(input: { reason: string; confirm: true }): Promise<void>;

  // ── Phase 11: audit log ───────────────────────────────────────────────────
  listConfiguratorActions(input?: {
    fromTs?: Timestamp;
    limit?: number;
  }): Promise<ConfiguratorActionRow[]>;
}

/** Phase 11: Client-side lock interface. */
export interface LockClient {
  isSet(): Promise<boolean>;
  isUnlocked(): Promise<boolean>;
  setLockCode(code: string): Promise<void>;
  unlock(code: string): Promise<{ ok: boolean }>;
  lock(): Promise<void>;
  clearLock(currentCode: string): Promise<void>;
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

/**
 * User-tunable bootstrap-mode configuration. Surfaced via ConfigService and
 * read at runtime by `course.start_exploration` to determine the explore
 * agent's tool-call budget.
 */
export interface BootstrapConfigSnapshot {
  /**
   * Max tool-call steps the explore agent may take in a single run.
   * Bounded server-side; out-of-range values are rejected by the schema.
   */
  maxSteps: number;
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
  // Bootstrap-mode budget knob.
  bootstrapConfig(): Promise<BootstrapConfigSnapshot>;
  setBootstrapConfig(config: BootstrapConfigSnapshot): Promise<void>;
  // Phase 19 — first-run flow gating.
  firstRunCompleted(): Promise<boolean>;
  markFirstRunComplete(): Promise<void>;
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
  /**
   * Fetch the PNG bytes for a saved page render. Returns null if not available.
   * Uint8Array (rather than Buffer) so the type works in the renderer/browser context.
   */
  pageImage(input: { documentId: string; page: number }): Promise<Uint8Array | null>;
}

// ─── Phase 12: NotesClient (client-side) ─────────────────────────────────────

/**
 * Client-side NotesClient (no studentId on methods; resolved server-side via
 * getOrCreateDefaultStudentId in IPC handlers).
 */
export interface NotesClient {
  create(input: {
    format: "cornell" | "feynman" | "outline" | "free" | "sketch";
    body: NoteBody;
    context?: NoteContext;
  }): Promise<Note>;

  update(input: { noteId: NoteId; body: NoteBody }): Promise<Note>;

  get(noteId: NoteId): Promise<Note | null>;

  list(input?: {
    courseId?: CourseId;
    lessonId?: LessonId;
    format?: "cornell" | "feynman" | "outline" | "free";
    limit?: number;
  }): Promise<Note[]>;

  delete(noteId: NoteId): Promise<void>;
}

// ─── Phase 12: FlashcardsClient (client-side) ────────────────────────────────

/** Client-side FlashcardsClient. */
export interface FlashcardsClient {
  create(input: {
    front: string;
    back: string;
    conceptId?: ConceptId;
    source?: { kind: "authored" | "extracted" | "user-created"; ref?: string };
  }): Promise<Flashcard>;

  update(input: {
    flashcardId: FlashcardId;
    patch: Partial<Pick<Flashcard, "front" | "back" | "conceptId">>;
  }): Promise<Flashcard>;

  get(flashcardId: FlashcardId): Promise<Flashcard | null>;

  list(input?: { conceptId?: ConceptId; due?: boolean; limit?: number }): Promise<Flashcard[]>;

  delete(flashcardId: FlashcardId): Promise<void>;

  review(input: {
    flashcardId: FlashcardId;
    rating: Rating;
  }): Promise<{ flashcard: Flashcard; nextReviewAt: Timestamp }>;

  dueCount(): Promise<number>;
}

/**
 * Phase 19: renderer-side update-check API. The main-process `UpdateService`
 * accepts a version string; the IPC handler reads `app.getVersion()`
 * internally and passes it through, so the renderer's surface is
 * parameter-less.
 */
export interface UpdateClientApi {
  checkLatest(): Promise<UpdateCheckResult>;
}
