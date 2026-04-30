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
  ConfigServiceImpl,
  DocumentsServiceImpl,
  DrizzleDocumentsReader,
  getOrCreateDefaultStudentId,
  IndexerOrchestratorImpl,
  LockServiceImpl,
  MasteryIndexer,
  MemoryServiceImpl,
  MisconceptionIndexer,
  SessionServiceImpl,
} from "@praxis/core/services";
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
import { createEngine } from "@praxis/engines";
import { sessions } from "@praxis/memory/schema";
import { ASSIGNMENT_TAKE_TOOLS, ASSIGNMENT_TUTOR_TOOLS } from "@praxis/tools/assignment";
import { AUTHORING_TOOLS } from "@praxis/tools/authoring";
import { COURSE_TOOLS } from "@praxis/tools/course";
import { gradeMathTool, PyodideSymPyService } from "@praxis/tools/math";
import { CONFIGURE_MEMORY_TOOLS, MEMORY_TOOLS } from "@praxis/tools/memory";
import { retrieveFromTextbookTool } from "@praxis/tools/retrieval";
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
  /** Phase 11: authoring service — exposed for IPC handlers. */
  authoring: AuthoringServiceImpl;
  ingestorRegistry: IngestorRegistry;
  pyodide: PyodideHost; // exposed so main can preload it
  embeddings: LocalEmbeddingService; // exposed so main can preload it
  /** Returns the default student ID for the single-student v1 install. */
  getDefaultStudentId: () => string;
}

export function buildServices(dbPath: string): Services {
  const { db, sqlite } = openDb({ path: dbPath });

  const log = {
    debug: (msg: string, meta?: object) => console.debug("[praxis]", msg, meta ?? ""),
    info: (msg: string, meta?: object) => console.info("[praxis]", msg, meta ?? ""),
    warn: (msg: string, meta?: object) => console.warn("[praxis]", msg, meta ?? ""),
    error: (msg: string, meta?: object) => console.error("[praxis]", msg, meta ?? ""),
  };

  // Phase 4: Pyodide + sandbox
  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const jsHost = new IsolatedVmHost();
  const sympy = new PyodideSymPyService(pyodide);
  const sandbox = new LocalCodeSandbox(jsHost, pyodide);

  // Phase 5: vectors + FTS + embeddings + page images
  const vectorStore = new SqliteVecStore(sqlite);
  const ftsStore = new SqliteFtsStore(sqlite);
  const embeddings = new LocalEmbeddingService();
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

  // Phase 11: LockServiceImpl — single instance, process-scoped unlock flag.
  const lockService = new LockServiceImpl({ db, log });

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
    authoring: authoringService, // ← Phase 11
    ingestorRegistry,
    pyodide,
    embeddings,
    getDefaultStudentId: () => getOrCreateDefaultStudentId(db),
  };
}
