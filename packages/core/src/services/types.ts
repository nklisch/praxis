import type { z } from "zod";
import type { EngineConfig } from "../config/index.js";
import type { PraxisDb } from "../db/index.js";
import type {
  ArtifactsService,
  AssignmentService,
  BootstrapService,
  CodeSandbox,
  CourseStateReader,
  DocumentsReader,
  EmbeddingService,
  Engine,
  FtsStore,
  IndexerOrchestrator,
  Logger,
  MemoryService,
  Mode,
  SymPyService,
  ToolDefinition,
  VectorStore,
} from "../types/index.js";

export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /**
   * Concrete tool services injected into ToolContext for handlers.
   * Phase 6 adds artifacts, bootstrap, courseState. Phase 7 adds memory.
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
    /** Phase 6: bootstrap draft management. */
    bootstrap: BootstrapService;
    /** Phase 6: narrow course-state reader (ArtifactsServiceImpl implements both). */
    courseState: CourseStateReader;
    /** Phase 7: concrete memory service. */
    memory: MemoryService;
    /** Phase 8: assignment create/submit/read. */
    assignments: AssignmentService;
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
}
