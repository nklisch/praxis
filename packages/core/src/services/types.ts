import type { z } from "zod";
import type { EngineConfig } from "../config/index.js";
import type { PraxisDb } from "../db/index.js";
import type {
  ArtifactsService,
  BootstrapService,
  CodeSandbox,
  CourseStateReader,
  DocumentsReader,
  EmbeddingService,
  Engine,
  FtsStore,
  Logger,
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
   * Phase 6 adds artifacts, bootstrap, courseState.
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
  };
  /**
   * Factory for constructing an Engine from a config. Optional — when omitted,
   * defaults to `createEngine` from @praxis/engines. Tests inject fakes here.
   */
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
}
