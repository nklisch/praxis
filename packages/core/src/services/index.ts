// Activity registry
export type { ActivityRegistryDeps } from "./activity-registry.js";
export { ActivityRegistryImpl } from "./activity-registry.js";

// Claude CLI auth service
export type {
  ClaudeAuthLoginEvent,
  ClaudeAuthLoginOptions,
  ClaudeAuthService,
  ClaudeAuthStatus,
} from "./claude-auth.js";
export { ClaudeAuthServiceImpl } from "./claude-auth.js";

// Phase 12: Notes service + Flashcards service
export type { FlashcardsServiceDeps } from "./flashcards-service.js";
export { FlashcardsServiceImpl } from "./flashcards-service.js";
export type { NotesServiceDeps } from "./notes-service.js";
export { NoteBodySchema, NotesServiceImpl } from "./notes-service.js";
export { FROM_SESSION_SUMMARY_PROMPT } from "./notes-session-summary-prompt.js";

// Phase 11: Lock service + Authoring service

export type { AuthoringServiceDeps } from "./authoring-service.js";
export { AuthoringServiceImpl } from "./authoring-service.js";
export type { LockServiceDeps } from "./lock-service.js";
export { LockServiceImpl } from "./lock-service.js";

// Phase 8: Assignment service + graders

export type { ArtifactsServiceDeps } from "./artifacts-service.js";
export { ArtifactsServiceImpl } from "./artifacts-service.js";
export type { AssignmentServiceDeps } from "./assignment-service.js";
export {
  AssignmentItemSchema,
  AssignmentServiceImpl,
  validateItems,
} from "./assignment-service.js";
export type { BootstrapServiceDeps } from "./bootstrap-service.js";
export { BootstrapServiceImpl } from "./bootstrap-service.js";
// Phase 15b: Concept-link fuzzy matcher
export type { ConceptMatch } from "./concept-link-matcher.js";
export { matchConceptByLabel } from "./concept-link-matcher.js";
// Phase 15b: Concept map service
export type { ConceptMapServiceDeps } from "./concept-map-service.js";
export { ConceptMapServiceImpl } from "./concept-map-service.js";
// Phase 15b: Concept map snapshotter indexer
export type { ConceptMapSnapshotterDeps } from "./concept-map-snapshotter.js";
export { ConceptMapSnapshotter } from "./concept-map-snapshotter.js";
export { ConfigServiceImpl } from "./config-service.js";
// Phase 16: Course documents service
export type { CourseDocumentsServiceDeps } from "./course-documents-service.js";
export { CourseDocumentsServiceImpl } from "./course-documents-service.js";
export { DrizzleDocumentsReader } from "./documents-reader-impl.js";
export type { DocumentsServiceDeps } from "./documents-service.js";
export { DocumentsServiceImpl } from "./documents-service.js";
// durable-drafts: DraftStore port + SQLite adapter
export type { DraftStore } from "./draft-store.js";
export { SqliteDraftStore } from "./draft-store.js";
// Phase 8: Graders
export { enrichWithApproachFeedback } from "./graders/approach-feedback.js";
export { buildGraderRegistry } from "./graders/registry.js";
export type { RunRubricAgentInput } from "./graders/rubric-agent.js";
export { runRubricAgent } from "./graders/rubric-agent.js";
export type { GraderContext, GraderResult, GraderServices, ItemGrader } from "./graders/types.js";
// Phase 18: Affective indexer
export type { AffectiveIndexerDeps } from "./indexers/affective-indexer.js";
export { AffectiveIndexer } from "./indexers/affective-indexer.js";
// Phase 15b: Concept map divergence indexer
export type { ConceptMapDivergenceIndexerDeps } from "./indexers/concept-map-divergence-indexer.js";
export { ConceptMapDivergenceIndexer } from "./indexers/concept-map-divergence-indexer.js";
export type { MasteryIndexerDeps } from "./indexers/mastery-indexer.js";
export { applySignalsToConcept, MasteryIndexer } from "./indexers/mastery-indexer.js";
export type { MisconceptionIndexerDeps } from "./indexers/misconception-indexer.js";
export { MisconceptionIndexer, upsertMisconception } from "./indexers/misconception-indexer.js";
// Phase 7: Memory service + indexers
export type { IndexerOrchestratorDeps } from "./indexers/orchestrator.js";
export { IndexerOrchestratorImpl } from "./indexers/orchestrator.js";
// Phase 18: Procedural indexer
export type {
  ProceduralIndexerDeps,
  SessionOutcome,
} from "./indexers/procedural-indexer.js";
export { ProceduralIndexer, scoreSessionOutcome } from "./indexers/procedural-indexer.js";
// Phase 8: LLM helpers
export { extractJsonBlock } from "./llm-helpers.js";
export type { BktParams, BktState } from "./memory/bkt.js";
export { bktInitial, bktUpdate, DEFAULT_BKT, signalToObservation } from "./memory/bkt.js";
export type { DecayInput } from "./memory/decay.js";
export { applyDecay, applyDecayAt } from "./memory/decay.js";
export type { MemoryServiceDeps } from "./memory/memory-service.js";
export { MemoryServiceImpl } from "./memory/memory-service.js";
// Phase 17: QuickCheck service
export { QuickCheckServiceImpl } from "./quick-check-service.js";
export { SessionServiceImpl } from "./session-service.js";
// Phase 15a: Sketch service
export type { SketchServiceDeps } from "./sketch-service.js";
export { SketchServiceImpl } from "./sketch-service.js";
export { getOrCreateDefaultStudentId } from "./student.js";
// Phase 14: Tabs service
export type { TabsServiceDeps } from "./tabs-service.js";
export { TabsServiceImpl } from "./tabs-service.js";
export type { ServiceDeps } from "./types.js";
// Phase 19: Update check (manual-download flow)
export {
  compareVersions,
  type UpdateCheckResult,
  type UpdateFeed,
  UpdateFeedSchema,
  type UpdateService,
  UpdateServiceImpl,
} from "./update-service.js";
// Phase 15a: Vision service
export type { VisionServiceDeps } from "./vision-service.js";
export { VisionServiceImpl } from "./vision-service.js";
