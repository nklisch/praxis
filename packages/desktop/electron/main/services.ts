import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { assignments } from "@praxis/artifacts/schema";
import { readBootstrapConfig, readEngineConfig } from "@praxis/core/config";
import { openDb } from "@praxis/core/db";
import { FsPageImageStore, IngestionService } from "@praxis/core/ingestion";
import type { NodeWorker } from "@praxis/core/runtime";
import type { ServiceDeps } from "@praxis/core/services";
import {
  ActivityRegistryImpl,
  ArtifactsServiceImpl,
  AssignmentServiceImpl,
  AuthoringServiceImpl,
  BootstrapServiceImpl,
  ClaudeAuthServiceImpl,
  ConceptMapDivergenceIndexer,
  ConceptMapServiceImpl,
  ConceptMapSnapshotter,
  ConfigServiceImpl,
  CourseDocumentsServiceImpl,
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
  QuickCheckServiceImpl,
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
import {
  PedagogyPackServiceImpl,
} from "@praxis/curriculum/pedagogy";
import { PackImportServiceImpl, SqliteConceptEmbeddingsStore } from "@praxis/curriculum/packs";
import { FsrsSchedulerImpl } from "@praxis/curriculum/scheduling";
import { createEngine } from "@praxis/engines";
import { sessions } from "@praxis/memory/schema";
import { ASSIGNMENT_TAKE_TOOLS, ASSIGNMENT_TUTOR_TOOLS } from "@praxis/tools/assignment";
import { AUTHORING_TOOLS } from "@praxis/tools/authoring";
import { COURSE_TOOLS } from "@praxis/tools/course";
import { startExplorationTool } from "@praxis/tools/course/start-exploration";
import { DOCUMENT_TOOLS } from "@praxis/tools/document";
import { EXAM_TOOLS } from "@praxis/tools/exam";
import { FLASHCARD_TOOLS } from "@praxis/tools/flashcards";
import { gradeMathTool, PyodideSymPyService } from "@praxis/tools/math";
import { CONFIGURE_MEMORY_TOOLS, MEMORY_TOOLS } from "@praxis/tools/memory";
import { NOTE_TOOLS } from "@praxis/tools/notes";
import { QUICK_CHECK_TOOLS } from "@praxis/tools/quick-check";
import { retrieveFromTextbookTool } from "@praxis/tools/retrieval";
import {
  DocxIngestor,
  EpubIngestor,
  HtmlIngestor,
  IngestorRegistry,
  JsPdfIngestor,
  MarkdownIngestor,
  PlainTextIngestor,
  PyodideHost,
  PyodideLanguageSandbox,
  QuickJsLanguageSandbox,
  SqliteFtsStore,
  SqliteVecStore,
  VisionPdfIngestor,
  WorkerEmbeddingService,
} from "@praxis/tools/runtime";
import { CodeSandboxImpl, createCodeSandboxTool } from "@praxis/tools/sandbox";
import { sketchReadTool } from "@praxis/tools/sketch";
import { eq } from "drizzle-orm";
import { app } from "electron";
import type { MainLogger } from "./logger.js";
import { spawnNodeWorker } from "./runtime/spawn-node-worker.js";

/**
 * Default model + dimension shared between the embeddings worker and its
 * host-side proxy. They MUST match — the worker is configured via env vars
 * derived from these and the proxy reports the same values synchronously to
 * `EmbeddingService` consumers.
 */
const EMBEDDINGS_MODEL_ID = "Xenova/bge-small-en-v1.5";
const EMBEDDINGS_DIMENSION = 384;

/**
 * ESM-friendly equivalent of CommonJS `require`. Used to resolve the absolute
 * filesystem path of worker scripts shipped inside `@praxis/*` packages.
 *
 * Caveat: forked child processes run vanilla Node — they do NOT honor the
 * `praxis-source` export condition that Electron's main process resolves
 * with in dev. So we resolve to each package's `package.json` (always
 * available) and construct the explicit `dist/.../<script>.js` path
 * ourselves. This gives us the SAME path in dev and packaged builds.
 * `pnpm dev` runs `pnpm build` first, so `dist/` is always populated.
 */
const requireFromHere = createRequire(import.meta.url);

function resolveDistPath(packageName: string, distSubpath: string): string {
  const pkgJson = requireFromHere.resolve(`${packageName}/package.json`);
  return join(dirname(pkgJson), distSubpath);
}

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
  /** Phase 15b: concept map service — exposed for IPC handlers. */
  conceptMaps: ConceptMapServiceImpl;
  /** Phase 16: course ↔ document attachment service. */
  courseDocuments: CourseDocumentsServiceImpl;
  /** Activity registry — exposed for the activity IPC channel and shutdown. */
  activity: ActivityRegistryImpl;
  /** Phase 17: quick check service — human-in-the-loop dispatch for quick_check.* tools. */
  quickCheck: QuickCheckServiceImpl;
  /** Phase 18: pedagogy pack service — read-only service over the bundled pedagogy pack. */
  pedagogyPack: PedagogyPackServiceImpl;
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

  // Activity registry — constructed first so all producers can reference it.
  const activityRegistry = new ActivityRegistryImpl({ log });

  // Phase 17: QuickCheckService — stateless in-process dispatch.
  const quickCheckService = new QuickCheckServiceImpl();

  // Phase 4: Pyodide + sandbox
  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const sympy = new PyodideSymPyService(pyodide);
  // QuickJS (WASM) replaces isolated-vm for JavaScript. No native binding,
  // no ABI dance, no forked worker needed. Each run() creates a fresh
  // QuickJSRuntime + Context (~2-5ms) — same cost order as before.
  const sandbox = new CodeSandboxImpl({
    adapters: [new QuickJsLanguageSandbox(), new PyodideLanguageSandbox(pyodide)],
  });
  const codeSandboxTool = createCodeSandboxTool(sandbox);

  // Phase 5: vectors + FTS + embeddings + page images
  const vectorStore = new SqliteVecStore(sqlite);
  const ftsStore = new SqliteFtsStore(sqlite);
  // Embeddings live in a forked Node-mode child process. onnxruntime-node
  // (the backend used by @huggingface/transformers) trips Electron's V8
  // memory cage with SIGTRAP on inference if loaded into the GUI main
  // process; the child is the same Electron binary launched in
  // ELECTRON_RUN_AS_NODE mode, where the runtime sandbox check is gated on
  // Chromium init paths that the Node-only mode skips. See
  // ./runtime/spawn-node-worker.ts for the full rationale.
  //
  // Cache routing: in packaged builds the @huggingface/transformers default
  // cache (`node_modules/@huggingface/transformers/.cache`) lives inside the
  // read-only app.asar and crashes with ENOTDIR on first model fetch. We
  // hand the worker an explicit cacheDir under userData/.
  const embeddingsWorker = spawnNodeWorker({
    scriptPath: resolveDistPath("@praxis/tools", "dist/runtime/embeddings-worker.js"),
    name: "embeddings",
    log,
    env: {
      PRAXIS_EMBEDDINGS_MODEL_ID: EMBEDDINGS_MODEL_ID,
      PRAXIS_EMBEDDINGS_DIMENSION: String(EMBEDDINGS_DIMENSION),
      ...(app.isPackaged && {
        PRAXIS_EMBEDDINGS_CACHE_DIR: join(app.getPath("userData"), "transformers-cache"),
      }),
    },
  });
  const embeddings = new WorkerEmbeddingService({
    worker: embeddingsWorker,
    modelId: EMBEDDINGS_MODEL_ID,
    dimension: EMBEDDINGS_DIMENSION,
  });
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

  // Phase 18: pedagogy pack service — loads the bundled pack JSON at boot.
  // Empty-pack mode when the v1 content file hasn't landed yet (no packPath override needed;
  // the default path resolves to packages/curriculum/pedagogy/v1.json at runtime).
  const pedagogyPackService = new PedagogyPackServiceImpl({ log });

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

  // Phase 16: CourseDocumentsServiceImpl — must be constructed before BootstrapServiceImpl.
  const courseDocumentsService = new CourseDocumentsServiceImpl({ db, log });

  const bootstrapService = new BootstrapServiceImpl({
    db,
    log,
    engineResolver: bootstrapEngineResolver,
    courseDocuments: courseDocumentsService,
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

  // Phase 16: notifyParentSession ref-cell pattern.
  // AssignmentServiceImpl is constructed BEFORE SessionServiceImpl (ordering
  // constraint from Phase 9: assignment → artifacts → session). We bridge
  // the dependency with a ref-cell: a mutable closure that starts as undefined
  // and is pointed at sessionService.notifySession after SessionServiceImpl is
  // constructed. This avoids a circular dep while keeping both services testable
  // with simple mocks.
  let notifyParentSessionRef:
    | ((input: {
        parentSessionId: import("@praxis/core/types").SessionId;
        note: string;
        origin: import("@praxis/core/types").SystemNoteOrigin;
      }) => Promise<void>)
    | undefined;

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
    // Phase 16: forward notifications to sessionService once it's ready.
    notifyParentSession: (input) => notifyParentSessionRef?.(input) ?? Promise.resolve(),
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

  // Phase 15b: Concept map indexers.
  // NOTE: conceptMapService is constructed below — forward-declare the variable
  // and assign it before the indexers reference it via the lazy lambda.
  // We create conceptMapService early here so the indexers can reference it.
  const conceptMapService = new ConceptMapServiceImpl({ db, log });

  const conceptMapSnapshotter = new ConceptMapSnapshotter({
    log,
    conceptMaps: conceptMapService,
    sessionCourseId: readSessionCourseId,
  });

  const conceptMapDivergenceIndexer = new ConceptMapDivergenceIndexer({
    db,
    log,
    conceptMaps: conceptMapService,
    engineResolver: bootstrapEngineResolver,
    sessionCourseId: readSessionCourseId,
    courseStateReader: artifactsService,
  });

  const indexerOrchestrator = new IndexerOrchestratorImpl({
    db,
    log,
    indexers: [
      masteryIndexer,
      misconceptionIndexer,
      conceptMapSnapshotter,
      conceptMapDivergenceIndexer,
    ],
    activity: activityRegistry,
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
    ...COURSE_TOOLS,
    startExplorationTool, // imported via its own subpath to avoid a course-barrel cycle

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
      pedagogyPack: pedagogyPackService, // ← Phase 18
      lock: lockService, // ← Phase 11
      authoring: authoringService, // ← Phase 11
      notes: notesService, // ← Phase 12
      flashcards: flashcardsService, // ← Phase 12
      fsrsScheduler, // ← Phase 12
      sketches: sketchService, // ← Phase 15a
      vision: visionService, // ← Phase 15a
      conceptMaps: conceptMapService, // ← Phase 15b
      courseDocuments: courseDocumentsService, // ← Phase 16
      engineResolver: bootstrapEngineResolver, // ← Phase 16
      // Lazy-read the user-set bootstrap budget so UI changes apply to the
      // next exploration without restarting the desktop app.
      bootstrapConfigResolver: () => readBootstrapConfig(db),
      quickCheck: quickCheckService, // ← Phase 17
    },
    indexerOrchestrator, // ← Phase 7 (passed to SessionServiceImpl for scheduling)
    lockService, // ← Phase 11 (session.start lock check for configure mode)
    activity: activityRegistry,
  };

  const ingestion = new IngestionService({
    db,
    log,
    vectorStore,
    ftsStore,
    embeddings,
    ingestorRegistry,
    pageImageStore,
    courseDocuments: courseDocumentsService, // ← Phase 16
    activity: activityRegistry,
  });

  const documentsService = new DocumentsServiceImpl({
    db,
    vectorStore,
    ftsStore,
    pageImageStore,
  });

  const sessionService = new SessionServiceImpl(deps);

  // Phase 16: complete the ref-cell wiring now that sessionService is live.
  // Adapt the port signature (parentSessionId) to sessionService's (sessionId).
  notifyParentSessionRef = (input) =>
    sessionService.notifySession({
      sessionId: input.parentSessionId,
      note: input.note,
      origin: input.origin,
    });

  return {
    session: sessionService,
    config: new ConfigServiceImpl(deps),
    ingestion,
    documents: documentsService,
    artifacts: artifactsService,
    bootstrap: bootstrapService,
    memory: memoryService, // ← Phase 7
    assignments: assignmentService, // ← Phase 8
    packs: packImportService, // ← Phase 10
    pedagogyPack: pedagogyPackService, // ← Phase 18
    lock: lockService, // ← Phase 11
    claudeAuth: claudeAuthService,
    tabs: tabsService, // ← Phase 14
    authoring: authoringService, // ← Phase 11
    notes: notesService, // ← Phase 12
    flashcards: flashcardsService, // ← Phase 12
    fsrsScheduler, // ← Phase 12
    sketches: sketchService, // ← Phase 15a
    conceptMaps: conceptMapService, // ← Phase 15b
    courseDocuments: courseDocumentsService, // ← Phase 16
    activity: activityRegistry,
    quickCheck: quickCheckService, // ← Phase 17
    ingestorRegistry,
    pyodide,
    embeddings,
    workers: {
      embeddings: embeddingsWorker,
    },
    getDefaultStudentId: () => getOrCreateDefaultStudentId(db),
  };
}
