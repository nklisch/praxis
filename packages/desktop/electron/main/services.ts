import { readCourseCreateConfig } from "@praxis/core/config";
import { openDb } from "@praxis/core/db";
import { IngestionService } from "@praxis/core/ingestion";
import type { NodeWorker } from "@praxis/core/runtime";
import type {
  ActivityRegistryImpl,
  ArtifactsServiceImpl,
  AssignmentServiceImpl,
  AuthoringServiceImpl,
  CitationsServiceImpl,
  ClaudeAuthServiceImpl,
  ConceptMapServiceImpl,
  CourseCreateServiceImpl,
  DocumentScopesServiceImpl,
  FlashcardsServiceImpl,
  LibraryServiceImpl,
  LockServiceImpl,
  MemoryServiceImpl,
  NotesServiceImpl,
  ProgressServiceImpl,
  QuickCheckServiceImpl,
  RecommendationServiceImpl,
  ServiceDeps,
  SessionPromotionRegistryImpl,
  SketchServiceImpl,
  SubAgentRegistryImpl,
  TabsServiceImpl,
} from "@praxis/core/services";
import {
  ConfigServiceImpl,
  DocumentsServiceImpl,
  getOrCreateDefaultStudentId,
  SessionServiceImpl,
  SessionSweepIndexer,
  UpdateServiceImpl,
} from "@praxis/core/services";
import type { PackImportService } from "@praxis/core/types";
import {
  configureMode,
  courseCreateMode,
  examMode,
  homeworkMode,
  quizMode,
  teachMode,
} from "@praxis/curriculum/modes";
import type { PedagogyPackServiceImpl } from "@praxis/curriculum/pedagogy";
import type { FsrsSchedulerImpl } from "@praxis/curriculum/scheduling";
import { ASSIGNMENT_TAKE_TOOLS, ASSIGNMENT_TUTOR_TOOLS } from "@praxis/tools/assignment";
import { AUTHORING_TOOLS } from "@praxis/tools/authoring";
import { COURSE_TOOLS } from "@praxis/tools/course";
import { startDraftingTool } from "@praxis/tools/course/start-drafting";
import { DIALOG_TOOLS } from "@praxis/tools/dialog";
import { DOCUMENT_TOOLS } from "@praxis/tools/document";
import { EXAM_TOOLS } from "@praxis/tools/exam";
import { FLASHCARD_TOOLS } from "@praxis/tools/flashcards";
import { gradeMathTool } from "@praxis/tools/math";
import { CONFIGURE_MEMORY_TOOLS, MEMORY_TOOLS } from "@praxis/tools/memory";
import { NOTE_TOOLS } from "@praxis/tools/notes";
import { QUICK_CHECK_TOOLS } from "@praxis/tools/quick-check";
import { retrieveFromDocumentsTool } from "@praxis/tools/retrieval";
import type { IngestorRegistry, PyodideHost, WorkerEmbeddingService } from "@praxis/tools/runtime";
import { sketchReadTool } from "@praxis/tools/sketch";
import type { MainLogger } from "./logger.js";
import { buildArtifactsServices } from "./services/build-artifacts-services.js";
import { buildEmbeddingsServices } from "./services/build-embeddings-services.js";
import { buildIndexerServices } from "./services/build-indexer-services.js";
import { buildInfraServices } from "./services/build-infra-services.js";
import { buildMemoryServices } from "./services/build-memory-services.js";
import { buildSandboxServices } from "./services/build-sandbox-services.js";
import { buildSecretServices } from "./services/build-secret-services.js";
import { buildSessionPrecursors } from "./services/build-session-precursors.js";
import { buildWorkspaceServices } from "./services/build-workspace-services.js";

export interface Services {
  session: SessionServiceImpl;
  config: ConfigServiceImpl;
  /** Phase 19: manual-download update check. */
  update: UpdateServiceImpl;
  ingestion: IngestionService;
  documents: DocumentsServiceImpl;
  artifacts: ArtifactsServiceImpl; // ← Phase 6: exposed for IPC handlers
  bootstrap: CourseCreateServiceImpl; // ← Phase 6: exposed for shutdown
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
  /** Phase 15b: concept map service — exposed for IPC handlers. */
  conceptMaps: ConceptMapServiceImpl;
  /** Phase 16: polymorphic scope ↔ document attachment service. */
  documentScopes: DocumentScopesServiceImpl;
  /** Document citations service — record + list cited passages. */
  citations: CitationsServiceImpl;
  /** Activity registry — exposed for the activity IPC channel and shutdown. */
  activity: ActivityRegistryImpl;
  /** Sub-agent transparency registry — exposed for the subagent IPC channel. */
  subAgent: SubAgentRegistryImpl;
  /** Phase 17: quick check service — human-in-the-loop dispatch for quick_check.* tools. */
  quickCheck: QuickCheckServiceImpl;
  /** Phase 18: pedagogy pack service — read-only service over the bundled pedagogy pack. */
  pedagogyPack: PedagogyPackServiceImpl;
  /** Workbench recommendation engine — priority-ordered "what's next" queue. */
  recommendations: RecommendationServiceImpl;
  /** Per-course progress aggregator for the /progress route. */
  progress: ProgressServiceImpl;
  /** Catalogue search + FTS5 filters across notes and flashcards. */
  library: LibraryServiceImpl;
  /** In-memory registry of not-yet-persisted (unpromoted) sessions. */
  sessionPromotion: SessionPromotionRegistryImpl;
  /** Periodic sweep job: discards idle unpromoted sessions + cleans orphan tabs. */
  sessionSweep: SessionSweepIndexer;
  ingestorRegistry: IngestorRegistry;
  pyodide: PyodideHost; // exposed so main can preload it
  embeddings: WorkerEmbeddingService; // exposed so main can preload it
  /**
   * Forked Node-mode workers. The composition root keeps handles here so
   * the main-process shutdown chain can `await worker.shutdown()` before
   * `app.exit(0)` and we don't leak child processes.
   *
   * embeddings: onnxruntime-node worker (stays forked — SIGTRAP in Electron V8 cage).
   */
  workers: { embeddings: NodeWorker };
  /** Returns the default student ID for the single-student v1 install. */
  getDefaultStudentId: () => string;
}

export function buildServices(dbPath: string, log: MainLogger): Services {
  const { db, sqlite } = openDb({ path: dbPath });

  // Step 1: Infrastructure (activity registry, sub-agent registry, quick check)
  const infra = buildInfraServices(log);

  // Step 2: Secrets (safe storage, Claude auth)
  const secrets = buildSecretServices(log);

  // Step 3: Sandbox (Pyodide, QuickJS, code sandbox tool)
  const sandbox = buildSandboxServices();

  // Step 4: Embeddings (vectors, FTS, worker, page/embedded images, packs, pedagogy)
  const embeddings = buildEmbeddingsServices(db, sqlite, log);

  // Step 5: Memory (MemoryServiceImpl)
  const memory = buildMemoryServices(db, log);

  // Step 6: Artifacts (document scopes, citations, draft store, course-create,
  //          assignment, artifacts — plus engine resolvers + notifyParentSession ref-cell)
  const artifacts = buildArtifactsServices({
    db,
    log,
    secretStorage: secrets.secretStorage,
    memoryService: memory.memoryService,
    sympy: sandbox.sympy,
    sandbox: sandbox.sandbox,
  });

  // Step 7: Indexers (concept map service + all six indexers + orchestrator)
  const indexers = buildIndexerServices({
    db,
    log,
    artifactsService: artifacts.artifactsService,
    bootstrapEngineResolver: artifacts.bootstrapEngineResolver,
    pedagogyPackService: embeddings.pedagogyPackService,
    activityRegistry: infra.activityRegistry,
  });

  // Step 8: Workspace productivity services (ingestors, scheduler, lock, tabs,
  //          sketch, vision, notes, flashcards, library, recommendations, progress)
  const workspace = buildWorkspaceServices({
    db,
    sqlite,
    log,
    secretStorage: secrets.secretStorage,
    memoryService: memory.memoryService,
    artifactsService: artifacts.artifactsService,
    draftStore: artifacts.draftStore,
    visionResolver: artifacts.visionResolver,
    bootstrapEngineResolver: artifacts.bootstrapEngineResolver,
    embeddedImageStore: embeddings.embeddedImageStore,
    pageImageStore: embeddings.pageImageStore,
  });

  // Step 9: Session precursors (promotion registry + ref-cell, prompt customization, authoring)
  const sessionPrecursors = buildSessionPrecursors({
    db,
    log,
    artifactsService: artifacts.artifactsService,
    memoryService: memory.memoryService,
    conceptMapService: indexers.conceptMapService,
    conceptMapConfiguratorId: indexers.conceptMapConfiguratorId,
  });

  // -------------------------------------------------------------------------
  // Modes + tool definitions (pure data — stay in the orchestrator)
  // -------------------------------------------------------------------------
  const modes = new Map([
    [teachMode.id, teachMode],
    [courseCreateMode.id, courseCreateMode], // ← Phase 6
    [quizMode.id, quizMode], // ← Phase 8
    [homeworkMode.id, homeworkMode], // ← Phase 8
    [examMode.id, examMode], // ← Phase 8
    [configureMode.id, configureMode], // ← Phase 11
  ]);

  const toolDefinitions = [
    gradeMathTool,
    sandbox.codeSandboxTool,
    retrieveFromDocumentsTool,
    ...COURSE_TOOLS,
    startDraftingTool, // imported via its own subpath to avoid a course-barrel cycle

    ...DOCUMENT_TOOLS, // ← Phase 16
    ...MEMORY_TOOLS, // ← Phase 7
    ...ASSIGNMENT_TUTOR_TOOLS, // ← Phase 8
    ...ASSIGNMENT_TAKE_TOOLS, // ← Phase 8
    ...AUTHORING_TOOLS, // ← Phase 11
    ...CONFIGURE_MEMORY_TOOLS, // ← Phase 11
    ...NOTE_TOOLS, // ← Phase 12
    ...FLASHCARD_TOOLS, // ← Phase 12
    sketchReadTool, // ← Phase 15a
    ...EXAM_TOOLS, // ← Phase 16
    ...QUICK_CHECK_TOOLS, // ← Phase 17
    ...DIALOG_TOOLS, // ← Phase 17 structured-question dialog
  ];

  // -------------------------------------------------------------------------
  // ServiceDeps assembly — the composition root's public contract
  // -------------------------------------------------------------------------
  const deps: ServiceDeps = {
    db,
    log,
    modes,
    toolDefinitions,
    recommendations: workspace.recommendationsService,
    toolServices: {
      sympy: sandbox.sympy,
      sandbox: sandbox.sandbox,
      vectorStore: embeddings.vectorStore,
      ftsStore: embeddings.ftsStore,
      embeddings: embeddings.embeddings,
      documents: embeddings.documentsReader,
      artifacts: artifacts.artifactsService, // ← Phase 6
      bootstrap: artifacts.bootstrapService, // ← Phase 6
      courseState: artifacts.artifactsService, // same instance implements both interfaces
      memory: memory.memoryService, // ← Phase 7
      assignments: artifacts.assignmentService, // ← Phase 8
      packs: embeddings.packImportService, // ← Phase 10
      pedagogyPack: embeddings.pedagogyPackService, // ← Phase 18
      lock: workspace.lockService, // ← Phase 11
      authoring: sessionPrecursors.authoringService, // ← Phase 11
      notes: workspace.notesService, // ← Phase 12
      flashcards: workspace.flashcardsService, // ← Phase 12
      fsrsScheduler: workspace.fsrsScheduler, // ← Phase 12
      sketches: workspace.sketchService, // ← Phase 15a
      vision: workspace.visionService, // ← Phase 15a
      conceptMaps: indexers.conceptMapService, // ← Phase 15b
      documentScopes: artifacts.documentScopesService, // ← Phase 16
      engineResolver: artifacts.bootstrapEngineResolver, // ← Phase 16
      // Lazy-read the user-set course-create budget so UI changes apply to the
      // next run without restarting the desktop app.
      courseCreateConfigResolver: () => readCourseCreateConfig(db),
      quickCheck: infra.quickCheckService, // ← Phase 17
      subAgent: infra.subAgentRegistry,
    },
    indexerOrchestrator: indexers.indexerOrchestrator, // ← Phase 7
    lockService: workspace.lockService, // ← Phase 11
    activity: infra.activityRegistry,
    subAgent: infra.subAgentRegistry,
    promptCustomization: sessionPrecursors.promptCustomizationService,
    secretStorage: secrets.secretStorage,
    sessionPromotionRegistry: sessionPrecursors.sessionPromotionRegistry,
  };

  // -------------------------------------------------------------------------
  // Terminal services — depend on the fully-assembled deps or on sessionService
  // -------------------------------------------------------------------------
  const ingestion = new IngestionService({
    db,
    log,
    vectorStore: embeddings.vectorStore,
    ftsStore: embeddings.ftsStore,
    embeddings: embeddings.embeddings,
    ingestorRegistry: workspace.ingestorRegistry,
    pageImageStore: embeddings.pageImageStore,
    embeddedImageStore: embeddings.embeddedImageStore,
    documentScopes: artifacts.documentScopesService, // ← Phase 16
    activity: infra.activityRegistry,
  });

  const documentsService = new DocumentsServiceImpl({
    db,
    vectorStore: embeddings.vectorStore,
    ftsStore: embeddings.ftsStore,
    pageImageStore: embeddings.pageImageStore,
    embeddedImageStore: embeddings.embeddedImageStore,
  });

  const sessionService = new SessionServiceImpl(deps);

  // -------------------------------------------------------------------------
  // Close both ref-cells now that sessionService is live
  // -------------------------------------------------------------------------

  // empty-session-cleanup: promotion registry thunks resolve from here on.
  sessionPrecursors.setSessionServiceRef(sessionService);

  // Phase 16: forward parent-session notifications through the live session service.
  artifacts.setNotifyParentSession((input) =>
    sessionService.notifySession({
      sessionId: input.parentSessionId,
      note: input.note,
      origin: input.origin,
    }),
  );

  // Sweep indexer — start after ref-cells are closed so no discard() call
  // can fire before sessionServiceRef is populated.
  const sessionSweepIndexer = new SessionSweepIndexer({
    registry: sessionPrecursors.sessionPromotionRegistry,
    db,
    log,
    config: () => ({ cadenceMs: 10 * 60 * 1000, idleMs: 30 * 60 * 1000 }),
  });
  sessionSweepIndexer.start();

  return {
    session: sessionService,
    config: new ConfigServiceImpl(deps),
    update: new UpdateServiceImpl(deps),
    ingestion,
    documents: documentsService,
    artifacts: artifacts.artifactsService,
    bootstrap: artifacts.bootstrapService,
    memory: memory.memoryService,
    assignments: artifacts.assignmentService,
    packs: embeddings.packImportService,
    pedagogyPack: embeddings.pedagogyPackService,
    lock: workspace.lockService,
    claudeAuth: secrets.claudeAuthService,
    tabs: workspace.tabsService,
    authoring: sessionPrecursors.authoringService,
    notes: workspace.notesService,
    flashcards: workspace.flashcardsService,
    fsrsScheduler: workspace.fsrsScheduler,
    sketches: workspace.sketchService,
    conceptMaps: indexers.conceptMapService,
    documentScopes: artifacts.documentScopesService,
    citations: artifacts.citationsService,
    activity: infra.activityRegistry,
    subAgent: infra.subAgentRegistry,
    quickCheck: infra.quickCheckService,
    recommendations: workspace.recommendationsService,
    progress: workspace.progressService,
    library: workspace.libraryService,
    sessionPromotion: sessionPrecursors.sessionPromotionRegistry,
    sessionSweep: sessionSweepIndexer,
    ingestorRegistry: workspace.ingestorRegistry,
    pyodide: sandbox.pyodide,
    embeddings: embeddings.embeddings,
    workers: {
      embeddings: embeddings.embeddingsWorker,
    },
    getDefaultStudentId: () => getOrCreateDefaultStudentId(db),
  };
}
