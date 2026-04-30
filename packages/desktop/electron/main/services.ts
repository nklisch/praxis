import { readEngineConfig } from "@praxis/core/config";
import { openDb } from "@praxis/core/db";
import { FsPageImageStore, IngestionService } from "@praxis/core/ingestion";
import type { ServiceDeps } from "@praxis/core/services";
import {
  ArtifactsServiceImpl,
  AssignmentServiceImpl,
  BootstrapServiceImpl,
  ConfigServiceImpl,
  DocumentsServiceImpl,
  DrizzleDocumentsReader,
  getOrCreateDefaultStudentId,
  IndexerOrchestratorImpl,
  MasteryIndexer,
  MemoryServiceImpl,
  MisconceptionIndexer,
  SessionServiceImpl,
} from "@praxis/core/services";
import type { AssignmentId } from "@praxis/core/types";
import { bootstrapMode, teachMode } from "@praxis/curriculum/modes";
import { createEngine } from "@praxis/engines";
import { sessions } from "@praxis/memory/schema";
import { COURSE_TOOLS } from "@praxis/tools/course";
import { gradeMathTool, PyodideSymPyService } from "@praxis/tools/math";
import { MEMORY_TOOLS } from "@praxis/tools/memory";
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

  // Phase 6: ArtifactsServiceImpl (reads + progress writes)
  const artifactsService = new ArtifactsServiceImpl({ db, log });

  // Phase 7: MemoryServiceImpl — decayDaysFor uses a global default of 14 days.
  // The integration agent (Phase 7 Part 2) will update this to read from the active course.
  const memoryService = new MemoryServiceImpl({
    db,
    log,
    decayDaysFor: () => 14,
  });

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

  // Phase 7: Indexers
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

  // Phase 8: AssignmentServiceImpl.
  // graderServices.engineResolver uses the same bootstrapEngineResolver pattern.
  // resolveSubmissionMode reads the session's modeId for the given assignment —
  // Agent 2 wires a proper lookup; for now default to "quiz" (safe fallback).
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
    // Agent 2 will replace this with a real session→mode lookup.
    resolveSubmissionMode: (_assignmentId: AssignmentId) => "quiz",
  });

  const modes = new Map([
    [teachMode.id, teachMode],
    [bootstrapMode.id, bootstrapMode], // ← Phase 6
  ]);

  const toolDefinitions = [
    gradeMathTool,
    codeSandboxTool,
    retrieveFromTextbookTool,
    ...COURSE_TOOLS, // ← Phase 6
    ...MEMORY_TOOLS, // ← Phase 7
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
    },
    indexerOrchestrator, // ← Phase 7 (passed to SessionServiceImpl for scheduling)
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
    ingestorRegistry,
    pyodide,
    embeddings,
    getDefaultStudentId: () => getOrCreateDefaultStudentId(db),
  };
}
