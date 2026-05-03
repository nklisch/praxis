import { join } from "node:path";
import { assignments } from "@praxis/artifacts/schema";
import { readEngineConfig } from "@praxis/core/config";
import { openDb } from "@praxis/core/db";
import { FsPageImageStore, IngestionService } from "@praxis/core/ingestion";
import type { ServiceDeps } from "@praxis/core/services";
import {
  ArtifactsServiceImpl,
  AssignmentServiceImpl,
  AuthoringServiceImpl,
  BootstrapServiceImpl,
  ClaudeAuthServiceImpl,
  ConfigServiceImpl,
  DocumentsServiceImpl,
  DrizzleDocumentsReader,
  FlashcardsServiceImpl,
  getOrCreateDefaultStudentId,
  IndexerOrchestratorImpl,
  LockServiceImpl,
  MasteryIndexer,
  MemoryServiceImpl,
  MisconceptionIndexer,
  NotesServiceImpl,
  SessionServiceImpl,
  SketchServiceImpl,
  TabsServiceImpl,
  VisionServiceImpl,
} from "@praxis/core/services";
import { FsSketchStore } from "@praxis/core/sketch";
import type { AssignmentId, ConfiguratorId, PackImportService } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import {
  bootstrapMode,
  configureMode,
  examMode,
  homeworkMode,
  quizMode,
  teachMode,
} from "@praxis/curriculum/modes";
import { PackImportServiceImpl, SqliteConceptEmbeddingsStore } from "@praxis/curriculum/packs";
import { FsrsSchedulerImpl } from "@praxis/curriculum/scheduling";
import { createEngine } from "@praxis/engines";
import { sessions } from "@praxis/memory/schema";
import { ASSIGNMENT_TAKE_TOOLS, ASSIGNMENT_TUTOR_TOOLS } from "@praxis/tools/assignment";
import { AUTHORING_TOOLS } from "@praxis/tools/authoring";
import { COURSE_TOOLS } from "@praxis/tools/course";
import { FLASHCARD_TOOLS } from "@praxis/tools/flashcards";
import { gradeMathTool, PyodideSymPyService } from "@praxis/tools/math";
import { CONFIGURE_MEMORY_TOOLS, MEMORY_TOOLS } from "@praxis/tools/memory";
import { NOTE_TOOLS } from "@praxis/tools/notes";
import { retrieveFromTextbookTool } from "@praxis/tools/retrieval";
import { sketchReadTool } from "@praxis/tools/sketch";
import {
  DocxIngestor,
  EpubIngestor,
  HtmlIngestor,
  IngestorRegistry,
  IsolatedVmHost,
  JsPdfIngestor,
  LocalEmbeddingService,
  MarkdownIngestor,
  PlainTextIngestor,
  PyodideHost,
  SqliteFtsStore,
  SqliteVecStore,
  VisionPdfIngestor,
} from "@praxis/tools/runtime";
import { codeSandboxTool, LocalCodeSandbox } from "@praxis/tools/sandbox";
import { eq } from "drizzle-orm";
import { app } from "electron";
import type { MainLogger } from "./logger.js";

export interface Services {
  session: SessionServiceImpl;
  config: ConfigServiceImpl;
  ingestion: IngestionService;
  documents: DocumentsServiceImpl;
  artifacts: ArtifactsServiceImpl; // ← Phase 6: exposed for IPC handlers
  bootstrap: BootstrapServiceImpl; // ← Phase 6: exposed for shutdown
  memory: MemoryServiceImpl; // ← Phase 7: exposed for IPC handlers
  assignments: AssignmentServiceImpl; // ← Phase 8: exposed for IPC handlers (Agent 2)
  /** Phase 10: pack import + listing — exposed for IPC handlers. */
  packs: PackImportService;
  /** Phase 11: lock service — exposed for IPC handlers. */
  lock: LockServiceImpl;
  /** Claude CLI auth service — exposed for IPC handlers. */
  claudeAuth: ClaudeAuthServiceImpl;
  /** Phase 14: tab strip persistence — exposed for IPC handlers. */
  tabs: TabsServiceImpl;
  /** Phase 11: authoring service — exposed for IPC handlers. */
  authoring: AuthoringServiceImpl;
  /** Phase 12: notes management — exposed for IPC handlers. */
  notes: NotesServiceImpl;
  /** Phase 12: flashcard management + FSRS review — exposed for IPC handlers. */
  flashcards: FlashcardsServiceImpl;
  /** Phase 12: FSRS scheduler — exposed for tools that need preview. */
  fsrsScheduler: FsrsSchedulerImpl;
  /** Phase 15a: sketch service — exposed for IPC handlers. */
  sketches: SketchServiceImpl;
  ingestorRegistry: IngestorRegistry;
  pyodide: PyodideHost; // exposed so main can preload it
  embeddings: LocalEmbeddingService; // exposed so main can preload it
  /** Returns the default student ID for the single-student v1 install. */
  getDefaultStudentId: () => string;
}

export function buildServices(dbPath: string, log: MainLogger): Services {
  const { db, sqlite } = openDb({ path: dbPath });

  // Phase 4: Pyodide + sandbox
  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const jsHost = new IsolatedVmHost();
  const sympy = new PyodideSymPyService(pyodide);
  const sandbox = new LocalCodeSandbox(jsHost, pyodide);

  // Phase 5: vectors + FTS + embeddings + page images
  const vectorStore = new SqliteVecStore(sqlite);
  const ftsStore = new SqliteFtsStore(sqlite);
  // Route the @huggingface/transformers cache to userData/ in a packaged
  // build — its default of `node_modules/@huggingface/transformers/.cache`
  // lives inside the read-only app.asar and crashes with ENOTDIR on first
  // model fetch. In dev, leave cacheDir unset and let transformers.js use
  // its default node_modules cache.
  const embeddings = app.isPackaged
    ? new LocalEmbeddingService({
        cacheDir: join(app.getPath("userData"), "transformers-cache"),
      })
    : new LocalEmbeddingService();
  const pageImageStore = new FsPageImageStore();
  const documentsReader = new DrizzleDocumentsReader(db, pageImageStore);

  // Phase 10: concept embeddings + pack import service.
  const conceptEmbeddings = new SqliteConceptEmbeddingsStore(sqlite, log);
  const packImportService = new PackImportServiceImpl({
    db,
    log,
    embeddings, // reuse the same LocalEmbeddingService (bge-small-en-v1.5, 384d)
    conceptEmbeddings,
  });

  // Vision resolver — looks up the active engine config at call time so swaps reflect immediately
  const visionResolver = () => {
    try {
      const engineConfig = readEngineConfig(db);
      const engine = createEngine({ config: engineConfig, deps: { log } });
      return engine.vision;
    } catch {
      return undefined;
    }
  };

  // Phase 6: Bootstrap engine resolver — same pattern as visionResolver above.
  // Looks up the active engine at call time so engine swaps reflect immediately.
  const bootstrapEngineResolver = () => {
    const engineConfig = readEngineConfig(db);
    return createEngine({ config: engineConfig, deps: { log } });
  };

  const bootstrapService = new BootstrapServiceImpl({
    db,
    log,
    engineResolver: bootstrapEngineResolver,
  });

  // Phase 7: helper to look up the courseId for a given session (used by indexers).
  const readSessionCourseId = (sessionId: string): string | null => {
    const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    return row?.courseId ?? null;
  };

  // Ingestor registry — all 7 ingestors
  const ingestorRegistry = new IngestorRegistry([
    new PlainTextIngestor(),
    new MarkdownIngestor(),
    new HtmlIngestor(),
    new DocxIngestor(),
    new EpubIngestor(),
    new JsPdfIngestor(),
    new VisionPdfIngestor({ visionResolver, pageImageStore }),
  ]);

  // Phase 7: MemoryServiceImpl — decayDaysFor uses a global default of 14 days.
  // Phase 9: MemoryServiceImpl must be constructed BEFORE ArtifactsServiceImpl
  // because ArtifactsServiceImpl now receives it as MasteryReader.
  const memoryService = new MemoryServiceImpl({
    db,
    log,
    decayDaysFor: () => 14,
  });

  // Phase 8: AssignmentServiceImpl.
  // Phase 9: Must be constructed BEFORE ArtifactsServiceImpl (GradeReader injection).
  const assignmentEngineResolver = () => {
    const engineConfig = readEngineConfig(db);
    return createEngine({ config: engineConfig, deps: { log } });
  };

  const assignmentService = new AssignmentServiceImpl({
    db,
    log,
    graderServices: {
      sympy,
      sandbox,
      engineResolver: assignmentEngineResolver,
    },
    // Read the assignment's kind column to resolve the submission mode.
    resolveSubmissionMode: (assignmentId: AssignmentId) => {
      const row = db.select().from(assignments).where(eq(assignments.id, assignmentId)).get();
      return (row?.kind as "quiz" | "homework" | "exam") ?? "quiz";
    },
  });

  // Phase 6: ArtifactsServiceImpl (reads + progress writes).
  // Phase 9: Constructed AFTER memoryService and assignmentService so they can be
  // injected as MasteryReader and GradeReader. Critical ordering: memory → assignment → artifacts.
  const artifactsService = new ArtifactsServiceImpl({
    db,
    log,
    masteryReader: memoryService, // Phase 9: MasteryReader adapter
    gradeReader: assignmentService, // Phase 9: GradeReader adapter
  });

  // Phase 7: Indexers (use artifactsService after it's constructed above)
  const masteryIndexer = new MasteryIndexer({
    db,
    log,
    courseStateReader: artifactsService,
    sessionCourseId: readSessionCourseId,
  });

  const misconceptionIndexer = new MisconceptionIndexer({
    db,
    log,
    engineResolver: bootstrapEngineResolver,
    courseStateReader: artifactsService,
    sessionCourseId: readSessionCourseId,
  });

  const indexerOrchestrator = new IndexerOrchestratorImpl({
    db,
    log,
    indexers: [masteryIndexer, misconceptionIndexer],
  });

  // Phase 12: FSRS scheduler — singleton, stateless.
  const fsrsScheduler = new FsrsSchedulerImpl();

  // Phase 11: LockServiceImpl — single instance, process-scoped unlock flag.
  const lockService = new LockServiceImpl({ db, log });

  // Claude CLI auth service — stateless, no DB dependency.
  const claudeAuthService = new ClaudeAuthServiceImpl({ log });

  // Phase 14: Tabs service — persists tab strip state to SQLite.
  const tabsService = new TabsServiceImpl({ db, log });

  // Phase 15a: Sketch service — content-addressed PNG store + SQLite metadata.
  const dataDir = join(app.getPath("userData"), "data");
  const sketchStore = new FsSketchStore(join(dataDir, "sketches"));
  const sketchService = new SketchServiceImpl({ db, log, store: sketchStore });

  // Phase 15a: Vision service — thin wrapper around the configured engine's VisionCapability.
  // Resolves the active engine at call time (same pattern as visionResolver above).
  const visionService = new VisionServiceImpl({ db, log });

  // Phase 12: Notes + Flashcards services.
  // Notes service uses the bootstrap engine resolver for fromSessionSummary.
  const notesService = new NotesServiceImpl({
    db,
    log,
    engineResolver: bootstrapEngineResolver,
    memory: memoryService,
  });

  const flashcardsService = new FlashcardsServiceImpl({
    db,
    log,
    scheduler: fsrsScheduler,
  });

  // Phase 11: AuthoringServiceImpl — orchestration layer for configurator writes.
  // Constructed after memoryService and artifactsService (depends on both).
  const authoringService = new AuthoringServiceImpl({
    db,
    log,
    artifacts: artifactsService,
    memory: memoryService,
    // v1: single configurator, always "default".
    configuratorId: () => "default" as ConfiguratorId,
    // v1: resolve the default student at call time (lazy, so no DB read at construction).
    studentId: () => brandId<"StudentId">(getOrCreateDefaultStudentId(db)),
  });

  const modes = new Map([
    [teachMode.id, teachMode],
    [bootstrapMode.id, bootstrapMode], // ← Phase 6
    [quizMode.id, quizMode], // ← Phase 8
    [homeworkMode.id, homeworkMode], // ← Phase 8
    [examMode.id, examMode], // ← Phase 8
    [configureMode.id, configureMode], // ← Phase 11
  ]);

  const toolDefinitions = [
    gradeMathTool,
    codeSandboxTool,
    retrieveFromTextbookTool,
    ...COURSE_TOOLS, // ← Phase 6
    ...MEMORY_TOOLS, // ← Phase 7
    ...ASSIGNMENT_TUTOR_TOOLS, // ← Phase 8
    ...ASSIGNMENT_TAKE_TOOLS, // ← Phase 8
    ...AUTHORING_TOOLS, // ← Phase 11
    ...CONFIGURE_MEMORY_TOOLS, // ← Phase 11
    ...NOTE_TOOLS, // ← Phase 12
    ...FLASHCARD_TOOLS, // ← Phase 12
    sketchReadTool, // ← Phase 15a
  ];

  const deps: ServiceDeps = {
    db,
    log,
    modes,
    toolDefinitions,
    toolServices: {
      sympy,
      sandbox,
      vectorStore,
      ftsStore,
      embeddings,
      documents: documentsReader,
      artifacts: artifactsService, // ← Phase 6
      bootstrap: bootstrapService, // ← Phase 6
      courseState: artifactsService, // same instance implements both interfaces
      memory: memoryService, // ← Phase 7
      assignments: assignmentService, // ← Phase 8
      packs: packImportService, // ← Phase 10
      lock: lockService, // ← Phase 11
      authoring: authoringService, // ← Phase 11
      notes: notesService, // ← Phase 12
      flashcards: flashcardsService, // ← Phase 12
      fsrsScheduler, // ← Phase 12
      sketches: sketchService, // ← Phase 15a
      vision: visionService, // ← Phase 15a
    },
    indexerOrchestrator, // ← Phase 7 (passed to SessionServiceImpl for scheduling)
    lockService, // ← Phase 11 (session.start lock check for configure mode)
  };

  const ingestion = new IngestionService({
    db,
    log,
    vectorStore,
    ftsStore,
    embeddings,
    ingestorRegistry,
    pageImageStore,
  });

  const documentsService = new DocumentsServiceImpl({
    db,
    vectorStore,
    ftsStore,
    pageImageStore,
  });

  return {
    session: new SessionServiceImpl(deps),
    config: new ConfigServiceImpl(deps),
    ingestion,
    documents: documentsService,
    artifacts: artifactsService,
    bootstrap: bootstrapService,
    memory: memoryService, // ← Phase 7
    assignments: assignmentService, // ← Phase 8
    packs: packImportService, // ← Phase 10
    lock: lockService, // ← Phase 11
    claudeAuth: claudeAuthService,
    tabs: tabsService, // ← Phase 14
    authoring: authoringService, // ← Phase 11
    notes: notesService, // ← Phase 12
    flashcards: flashcardsService, // ← Phase 12
    fsrsScheduler, // ← Phase 12
    sketches: sketchService, // ← Phase 15a
    ingestorRegistry,
    pyodide,
    embeddings,
    getDefaultStudentId: () => getOrCreateDefaultStudentId(db),
  };
}
