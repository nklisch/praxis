export type * from "./activity.js";
export type * from "./artifacts.js";
// Per-domain client files (new in Step 2 of the type split refactor).
// Existing per-domain files (notes.ts, flashcards.ts, artifacts.ts, etc.)
// auto-pick up their moved client interfaces via the existing `export type *` lines.
export type * from "./assignments-client.js";
export type * from "./authoring-client.js";
export type * from "./authoring-service.js";
export type * from "./citation.js";
// client.ts: Just the PraxisClient aggregate — all client API interfaces have
// moved to their per-domain homes.
export type { PraxisClient } from "./client.js";
// client-memory.ts: intentionally NOT exported via `export type *` to avoid
// ambiguity with the server-side MemoryService in memory.ts. Only the alias
// is surfaced; direct imports of the client-side type use the alias.
export type { MemoryService as MemoryClientService } from "./client-memory.js";
// ActivityClient is also exported via `export type * from "./activity.js"` above.
export type * from "./common.js";
export { LOG_LEVELS } from "./common.js"; // runtime const — not re-exported by `export type *`
export type * from "./concept-graph.js";
// Phase 15b: ConceptMapService interface + client API.
export type { ConceptMapClientApi, ConceptMapService } from "./concept-map-service.js";
export type * from "./config-service.js";
export type * from "./configurator.js";
export type * from "./conversation.js";
export type * from "./course-create-service.js";
export type * from "./course-state.js";
export type * from "./document-scopes.js";
// Course-create mode: live draft-stream events surfaced to the renderer.
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
// Per-service type files (split from tool.ts — public surface unchanged).
export type * from "./library-service.js";
export type * from "./lock-service.js";
// memory.ts: `export *` (not `export type *`) so MASTERY_SIGNAL_KINDS const is exported as a runtime value.
export * from "./memory.js";
export type * from "./mode.js";
export { DEFAULT_RENDER_TOGGLES, resolveRenderToggles } from "./mode.js"; // runtime values — not re-exported by `export type *`
// Phase 12: NoteBody + helpers — `export *` (not `export type *`) so parseNoteBody + serializeNoteBody are exported as runtime values.
export * from "./notes.js";
// Per-service type files split from tool.ts (public surface unchanged).
export type * from "./pack-import-service.js";
export type * from "./pedagogy.js";
// Progress aggregator — per-course rollup for the /progress route.
export type { CourseProgressRollup, ProgressClientApi, ProgressService } from "./progress.js";
export type * from "./prompt-attribution.js";
// Phase 17: QuickCheck types — human-in-the-loop dispatch + client API.
export type {
  QuickCheckAnswer,
  QuickCheckClientApi,
  QuickCheckEvent,
  QuickCheckListener,
  QuickCheckService,
} from "./quick-check.js";
export type * from "./rag-service.js";
// Workbench recommendation engine types + client API.
export type {
  DraftId,
  ModeId,
  Recommendation,
  RecommendationService,
  RecommendationsClientApi,
} from "./recommendation.js";
export type * from "./sandbox-service.js";
export type { SecretStorage } from "./secret-storage.js";
// Security: at-rest secret storage port (Electron safeStorage adapter in @praxis/desktop).
export { SecretStorageError } from "./secret-storage.js";
export type * from "./session-client.js";
export { SessionDiscardedError } from "./session-discarded-error.js";
export type * from "./shell-client.js";
// Phase 15a: Sketch types + client API.
export type {
  Sketch,
  SketchClientApi,
  SketchId,
  SketchService,
  SketchSummary,
} from "./sketches.js";
// Agent-transparency: sub-agent registry + event types + client API.
export type {
  SubAgentClientApi,
  SubAgentEvent,
  SubAgentHandle,
  SubAgentItem,
  SubAgentListener,
  SubAgentRegistry,
  SubAgentStartInput,
  SubAgentStep,
} from "./subagent.js";
export type * from "./sympy-service.js";
// Phase 14: Tab strip types + client API.
export type {
  DocumentTabSummary,
  SessionTabSummary,
  TabId,
  TabSummary,
  TabsClientApi,
  TabsService,
} from "./tabs.js";
// tool.ts: core tool primitives only (ToolDefinition, ToolContext, ToolServices, EffectKind).
export type * from "./tool.js";
export type * from "./update-client.js";
export { isAllowedExternalUrl } from "./url-allowlist.js"; // runtime helper — not re-exported by `export type *`
export type * from "./vision.js";
// ToolDispatchMeta is re-exported via engine.ts through the wildcard above.
