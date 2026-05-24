import { join } from "node:path";
import type { PraxisDb, SqliteDatabase } from "@praxis/core/db";
import { FsEmbeddedImageStore, FsPageImageStore } from "@praxis/core/ingestion";
import {
  ArtifactsServiceImpl,
  FlashcardsServiceImpl,
  LibraryServiceImpl,
  LockServiceImpl,
  MemoryServiceImpl,
  NotesServiceImpl,
  ProgressServiceImpl,
  RecommendationServiceImpl,
  SketchServiceImpl,
  SqliteDraftStore,
  TabsServiceImpl,
  VisionServiceImpl,
} from "@praxis/core/services";
import { FsSketchStore } from "@praxis/core/sketch";
import type { Engine, VisionCapability } from "@praxis/core/types";
import { FsrsSchedulerImpl } from "@praxis/curriculum/scheduling";
import {
  DocxIngestor,
  EpubIngestor,
  HtmlIngestor,
  IngestorRegistry,
  JsPdfIngestor,
  MarkdownIngestor,
  PlainTextIngestor,
  PptxIngestor,
  VisionPdfIngestor,
} from "@praxis/tools/runtime";
import { app } from "electron";
import type { MainLogger } from "../logger.js";
import type { ElectronSafeStorageAdapter } from "../secret-storage.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WorkspaceServiceDeps {
  db: PraxisDb;
  sqlite: SqliteDatabase;
  log: MainLogger;
  secretStorage: ElectronSafeStorageAdapter;
  memoryService: MemoryServiceImpl;
  artifactsService: ArtifactsServiceImpl;
  draftStore: SqliteDraftStore;
  visionResolver: () => VisionCapability | undefined;
  bootstrapEngineResolver: () => Engine;
  embeddedImageStore: FsEmbeddedImageStore;
  pageImageStore: FsPageImageStore;
}

export interface WorkspaceServices {
  ingestorRegistry: IngestorRegistry;
  fsrsScheduler: FsrsSchedulerImpl;
  lockService: LockServiceImpl;
  tabsService: TabsServiceImpl;
  sketchService: SketchServiceImpl;
  visionService: VisionServiceImpl;
  notesService: NotesServiceImpl;
  flashcardsService: FlashcardsServiceImpl;
  libraryService: LibraryServiceImpl;
  recommendationsService: RecommendationServiceImpl;
  progressService: ProgressServiceImpl;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Constructs the workspace-productivity services: ingestor registry,
 * scheduler, lock, tabs, sketch, vision, notes, flashcards, library,
 * recommendations, and progress.
 *
 * These services form the student-facing workspace layer — study timeline,
 * flashcard reviews, note-taking, concept-map authoring, and document
 * library. They depend on `db`, `sqlite`, and several outputs from earlier
 * factories, but are independent of the session layer (step 9 onwards).
 *
 * Construction requirement: `app.whenReady()` must have resolved before
 * calling this factory (for `app.getPath("userData")` used by the sketch
 * store). This constraint is guaranteed by the `buildServices()` call site.
 */
export function buildWorkspaceServices(deps: WorkspaceServiceDeps): WorkspaceServices {
  const {
    db,
    sqlite,
    log,
    secretStorage,
    memoryService,
    artifactsService,
    draftStore,
    visionResolver,
    bootstrapEngineResolver,
    embeddedImageStore,
    pageImageStore,
  } = deps;

  // Ingestor registry — all 8 ingestors.
  // Placed here rather than embeddings because it depends on `visionResolver`
  // (artifact-domain output, step 6) and `embeddedImageStore` (embeddings, step 4).
  const ingestorRegistry = new IngestorRegistry([
    new PlainTextIngestor(),
    new MarkdownIngestor(),
    new HtmlIngestor(),
    new DocxIngestor({ embeddedImageStore }),
    new EpubIngestor(),
    new JsPdfIngestor(),
    new PptxIngestor({ embeddedImageStore }),
    new VisionPdfIngestor({ visionResolver, pageImageStore }),
  ]);

  // Phase 12: FSRS scheduler — singleton, stateless.
  const fsrsScheduler = new FsrsSchedulerImpl();

  // Phase 11: LockServiceImpl — single instance, process-scoped unlock flag.
  const lockService = new LockServiceImpl({ db, log });

  // Phase 14: Tabs service — persists tab strip state to SQLite.
  const tabsService = new TabsServiceImpl({ db, log });

  // Phase 15a: Sketch service — content-addressed PNG store + SQLite metadata.
  // `dataDir` and `sketchStore` are local helpers; not exported.
  const dataDir = join(app.getPath("userData"), "data");
  const sketchStore = new FsSketchStore(join(dataDir, "sketches"));
  const sketchService = new SketchServiceImpl({ db, log, store: sketchStore });

  // Phase 15a: Vision service — thin wrapper around the configured engine's
  // VisionCapability. Resolves the active engine at call time.
  const visionService = new VisionServiceImpl({ db, log, secretStorage });

  // Phase 12: Notes service — uses the bootstrap engine resolver for
  // `fromSessionSummary`.
  const notesService = new NotesServiceImpl({
    db,
    log,
    engineResolver: bootstrapEngineResolver,
    memory: memoryService,
  });

  // Phase 12: Flashcards service — FSRS review scheduling.
  const flashcardsService = new FlashcardsServiceImpl({
    db,
    log,
    scheduler: fsrsScheduler,
  });

  // Library service — FTS5 search + saved filters across notes and flashcards.
  const libraryService = new LibraryServiceImpl({ db, sqlite });

  // Workbench recommendation engine — aggregates sessions, cards, mastery,
  // drafts. Reuses the shared draftStore from the artifacts factory.
  const recommendationsService = new RecommendationServiceImpl({
    db,
    log,
    draftStore,
  });

  // Per-course progress aggregator — rolls up mastery, lesson position,
  // active gate, stuck concepts, and recent events for the /progress route.
  const progressService = new ProgressServiceImpl({
    db,
    log,
    courseStateReader: artifactsService,
  });

  return {
    ingestorRegistry,
    fsrsScheduler,
    lockService,
    tabsService,
    sketchService,
    visionService,
    notesService,
    flashcardsService,
    libraryService,
    recommendationsService,
    progressService,
  };
}
