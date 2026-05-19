import type { z } from "zod";
import type { EngineConfig } from "../config/index.js";
import type { PraxisDb } from "../db/index.js";
import type {
  ActivityRegistry,
  ArtifactsService,
  AssignmentService,
  AuthoringService,
  CodeSandbox,
  ConceptMapService,
  CourseCreateService,
  CourseStateReader,
  DocumentScopesService,
  DocumentsReader,
  EmbeddingService,
  Engine,
  FlashcardsService,
  FsrsScheduler,
  FtsStore,
  IndexerOrchestrator,
  LockService,
  Logger,
  MemoryService,
  Mode,
  NotesService,
  PackImportService,
  PedagogyPackService,
  QuickCheckService,
  RecommendationService,
  SecretStorage,
  SketchService,
  SubAgentRegistry,
  SymPyService,
  ToolDefinition,
  VectorStore,
  VisionService,
} from "../types/index.js";
import type { PromptCustomizationService } from "./prompt-customization-service.js";

export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /**
   * Concrete tool services injected into ToolContext for handlers.
   * Phase 6 adds artifacts, course-create service, courseState. Phase 7 adds memory.
   */
  toolServices: {
    sympy: SymPyService;
    sandbox: CodeSandbox;
    vectorStore: VectorStore;
    ftsStore: FtsStore;
    embeddings: EmbeddingService;
    documents: DocumentsReader;
    /** Phase 6: concrete artifacts read/write service. */
    artifacts: ArtifactsService;
    /** Phase 6: course-create draft management. */
    bootstrap: CourseCreateService;
    /** Phase 6: narrow course-state reader (ArtifactsServiceImpl implements both). */
    courseState: CourseStateReader;
    /** Phase 7: concrete memory service. */
    memory: MemoryService;
    /** Phase 8: assignment create/submit/read. */
    assignments: AssignmentService;
    /** Phase 10: canonical knowledge packs — list, import. */
    packs: PackImportService;
    /** Phase 18: pedagogy pack — read-only teaching strategies, techniques, prompts. */
    pedagogyPack: PedagogyPackService;
    /** Phase 11: local lock code gate. */
    lock: LockService;
    /** Phase 11: configurator authoring + memory writes. */
    authoring: AuthoringService;
    /** Phase 12: notes management — create, update, list, delete. */
    notes: NotesService;
    /** Phase 12: flashcard management + FSRS review. */
    flashcards: FlashcardsService;
    /** Phase 12: FSRS scheduler — used by FlashcardsServiceImpl and flashcard.review_next tool. */
    fsrsScheduler: FsrsScheduler;
    /** Phase 15a: sketch storage + retrieval — used by sketch.read tool. */
    sketches: SketchService;
    /** Phase 15a: vision capability wrapper — used by grade_math sketch case to OCR drawings. */
    vision?: VisionService;
    /** Phase 15b: concept map CRUD + versioning. */
    conceptMaps: ConceptMapService;
    /** Phase 16: polymorphic scope ↔ document attachment management. */
    documentScopes: DocumentScopesService;
    /**
     * Phase 16: lazy engine resolver — used by tools that spawn isolated sessions.
     * Same pattern as courseCreateConfigResolver; wired from the same source.
     */
    engineResolver: () => Engine;
    /**
     * Resolves the user-tunable course-create config (currently just `maxSteps` —
     * the drafter's tool-call budget). Read at call time so a UI change
     * applies to the next drafting run. Optional so tests that don't exercise
     * the course-create path don't have to wire it.
     */
    courseCreateConfigResolver?: () => { maxSteps: number };
    /**
     * Phase 17: in-process human-in-the-loop quick check dispatch.
     * Tool handlers call `quickCheck.await(...)` to pend an inline question.
     * Optional so tests that don't need quick checks stay unaffected.
     */
    quickCheck?: QuickCheckService;
    /**
     * Sub-agent transparency registry. Tool handlers that spawn sub-agents
     * (e.g., `course.start_drafting`) use this to publish step-level events
     * that the UI subscribes to for the inline sub-agent block.
     * Optional so tests that don't wire it stay unaffected.
     */
    subAgent?: SubAgentRegistry;
  };
  /**
   * Phase 7: optional indexer orchestrator. When set, SessionServiceImpl will
   * schedule post-turn and session-end indexer runs. Tests that don't wire
   * indexers can leave this undefined.
   */
  indexerOrchestrator?: IndexerOrchestrator;
  /**
   * Factory for constructing an Engine from a config. Optional — when omitted,
   * defaults to `createEngine` from @praxis/engines. Tests inject fakes here.
   */
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
  /**
   * Phase 11: lock service for configure-mode session guard.
   * When modeId === "configure" and the lock is set but not unlocked, session.start throws.
   */
  lockService: LockService;
  /**
   * Activity registry that long-running services report progress to.
   * Surfaced to the renderer via the activity-rail IPC channel.
   * Not under toolServices — producers are services, not tool handlers.
   * Optional so tests that don't need activity reporting stay unaffected.
   */
  activity?: ActivityRegistry;
  /**
   * Sub-agent transparency registry. Surfaced to the renderer via the
   * subagent IPC channel. Optional so tests that don't exercise the
   * sub-agent path stay unaffected.
   */
  subAgent?: SubAgentRegistry;
  /**
   * Prompt customization service — reads global fragment + per-mode appends
   * + stored fragment overrides at session-compose time.
   * Optional so legacy tests that don't wire it stay unaffected (composeSystemPrompt
   * proceeds with no user layers applied).
   */
  promptCustomization?: PromptCustomizationService;
  /**
   * Workbench recommendation engine — aggregates open sessions, due cards,
   * low-mastery concepts, active drafts, and pending quick checks into a
   * priority-ordered list for the front door.
   */
  recommendations?: RecommendationService;
  /**
   * At-rest secret storage. Reads decrypt; writes encrypt. The Electron
   * adapter (`ElectronSafeStorageAdapter`) is wired in `@praxis/desktop`.
   * Tests use `inMemorySecretStorage()` from `tests/helpers/mocks.ts`.
   */
  secretStorage: SecretStorage;
}
