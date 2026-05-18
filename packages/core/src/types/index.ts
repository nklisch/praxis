export type * from "./activity.js";
export type * from "./artifacts.js";
export type * from "./citation.js";
// client.ts: Note: MemoryService is intentionally NOT re-exported from here.
// The client-side MemoryService (no studentId params) lives in ./client.ts and is
// imported directly by client code and MemoryClient. The server-side MemoryService
// (with studentId params) is exported from ./tool.ts via the tool.ts wildcard below.
// Re-export client MemoryService under a distinct alias so client code can import it.
export type {
  ArtifactsClientSurface,
  AssignmentsClient,
  AuthoringClient,
  BootstrapConfigSnapshot,
  BootstrapOpts,
  ConceptMapClientApi,
  ConfigService,
  CreateCourseInput,
  DocumentDetail,
  DocumentScopesClientApi,
  DocumentSummary,
  DocumentsClient,
  EngineConfigSnapshot,
  FileRef,
  FlashcardsClient,
  ImportedPackClient,
  IngestionClient,
  LockClient,
  MemoryService as MemoryClientService,
  NotesClient,
  PackSummaryClient,
  PacksClient,
  PraxisClient,
  ProgressSnapshot,
  RecommendationsClientApi,
  SessionEndSummary,
  SessionHandle,
  SessionService,
  SessionSummary,
  ShellClient,
  SketchClientApi,
  SubAgentClientApi,
  TabsClientApi,
  UpdateClientApi,
} from "./client.js";
// ActivityClient is also exported via `export type * from "./activity.js"` above.
export type * from "./common.js";
export { LOG_LEVELS } from "./common.js"; // runtime const — not re-exported by `export type *`
export type * from "./concept-graph.js";
// Phase 15b: ConceptMapService interface.
export type { ConceptMapService } from "./concept-map-service.js";
export type * from "./configurator.js";
export type * from "./conversation.js";
export type * from "./document-scopes.js";
// Bootstrap mode: live draft-stream events surfaced to the renderer.
export type * from "./draft-stream.js";
export type * from "./engine.js";
export { engineError } from "./engine.js"; // runtime helper — not re-exported by `export type *`
export type * from "./errors.js";
export { redactSecrets, serializeError, serializeErrorRedacted } from "./errors.js"; // runtime helpers — not re-exported by `export type *`
// Phase 12: FSRS types — exported as values (Rating is a type; FsrsState/FsrsScheduler are types).
export type * from "./flashcards.js";
export type * from "./gate.js";
export * from "./ids.js"; // exports `brandId` runtime helper
export type * from "./ingestion.js";
// memory.ts: `export *` (not `export type *`) so MASTERY_SIGNAL_KINDS const is exported as a runtime value.
export * from "./memory.js";
export type * from "./mode.js";
// Phase 12: NoteBody + helpers — `export *` (not `export type *`) so parseNoteBody + serializeNoteBody are exported as runtime values.
export * from "./notes.js";
export type * from "./pedagogy.js";
export type * from "./prompt-attribution.js";
// Phase 17: QuickCheck types — human-in-the-loop dispatch.
export type {
  QuickCheckAnswer,
  QuickCheckEvent,
  QuickCheckListener,
  QuickCheckService,
} from "./quick-check.js";
// Workbench recommendation engine types.
export type {
  DraftId,
  ModeId,
  Recommendation,
  RecommendationService,
} from "./recommendation.js";
export type { SecretStorage } from "./secret-storage.js";
// Security: at-rest secret storage port (Electron safeStorage adapter in @praxis/desktop).
export { SecretStorageError } from "./secret-storage.js";
// Phase 15a: Sketch types.
export type { Sketch, SketchId, SketchService, SketchSummary } from "./sketches.js";
// Agent-transparency: sub-agent registry + event types.
export type {
  SubAgentEvent,
  SubAgentHandle,
  SubAgentItem,
  SubAgentListener,
  SubAgentRegistry,
  SubAgentStartInput,
  SubAgentStep,
} from "./subagent.js";
// Phase 14: Tab strip types.
export type {
  DocumentTabSummary,
  SessionTabSummary,
  TabId,
  TabSummary,
  TabsService,
} from "./tabs.js";
// tool.ts: MemoryService here is the server-side interface (with studentId params).
export type * from "./tool.js";
export { isAllowedExternalUrl } from "./url-allowlist.js"; // runtime helper — not re-exported by `export type *`
// ToolDispatchMeta is re-exported via engine.ts through the wildcard above.
