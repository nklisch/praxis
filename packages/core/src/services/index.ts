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
// Library service (FTS5 search + saved filters)
export type { LibraryServiceDeps } from "./library-service.js";
export { LibraryServiceImpl } from "./library-service.js";
export type { NotesServiceDeps } from "./notes-service.js";
export { NoteBodySchema, NotesServiceImpl } from "./notes-service.js";
export { FROM_SESSION_SUMMARY_PROMPT } from "./notes-session-summary-prompt.js";
// Sub-agent transparency registry
export type { SubAgentRegistryDeps } from "./subagent-registry.js";
export { SubAgentRegistryImpl } from "./subagent-registry.js";

// Phase 11: Lock service + Authoring service

export type { AuthoringServiceDeps } from "./authoring-service.js";
export { AuthoringServiceImpl } from "./authoring-service.js";
export type { LockServiceDeps } from "./lock-service.js";
export { LockServiceImpl } from "./lock-service.js";
// Prompt customization layers
export type {
  FragmentOverride,
  PreviewPromptInput,
  PromptCustomizationService,
  PromptCustomizationServiceDeps,
} from "./prompt-customization-service.js";
export { PromptCustomizationServiceImpl } from "./prompt-customization-service.js";
// Snapshot-restore infrastructure
export type {
  CapturedSnapshot,
  SnapshotCapturerDeps,
  SnapshotPayload,
} from "./snapshot-capturer.js";
export { SNAPSHOT_SCHEMA_VERSION, SnapshotCapturer } from "./snapshot-capturer.js";

// Phase 8: Assignment service + graders

export type { ArtifactsServiceDeps } from "./artifacts-service.js";
export { ArtifactsServiceImpl } from "./artifacts-service.js";
export type { AssignmentServiceDeps } from "./assignment-service.js";
export {
  AssignmentItemSchema,
  AssignmentServiceImpl,
  validateItems,
} from "./assignment-service.js";
// Document citations service
export type { CitationsService, CitationsServiceDeps } from "./citations-service.js";
export { CitationsServiceImpl } from "./citations-service.js";
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
export type { CourseCreateServiceDeps } from "./course-create-service.js";
export { CourseCreateServiceImpl } from "./course-create-service.js";
export type { CourseStateReaderDeps } from "./course-state-reader-impl.js";
export { CourseStateReaderImpl } from "./course-state-reader-impl.js";
export type { CoursesServiceDeps } from "./courses-service.js";
export { CoursesServiceImpl, rowToCourse } from "./courses-service.js";
export type { DebugBundleCaptureServiceDeps } from "./debug/debug-bundle-capture-service.js";
export { DebugBundleCaptureServiceImpl } from "./debug/debug-bundle-capture-service.js";
export type { DebugLogFilters, DebugLogReader } from "./debug/debug-log-reader.js";
export { JsonlDebugLogReader } from "./debug/debug-log-reader.js";
export type { DebugTraceRegistryDeps } from "./debug/debug-trace-registry.js";
// Debug trace registry
export {
  DEFAULT_DEBUG_TRACE_MAX_RECORDS,
  DebugTraceRegistryImpl,
} from "./debug/debug-trace-registry.js";
// Phase 16: Document scopes service (polymorphic scope ↔ document attachment)
export type { DocumentScopesServiceDeps, PassageRange } from "./document-scopes-service.js";
export { DocumentScopesServiceImpl } from "./document-scopes-service.js";
export { DrizzleDocumentsReader } from "./documents-reader-impl.js";
export type { DocumentsServiceDeps } from "./documents-service.js";
export { DocumentsServiceImpl } from "./documents-service.js";
// durable-drafts: DraftStore port + SQLite adapter
export type { DraftStore } from "./draft-store.js";
export { SqliteDraftStore } from "./draft-store.js";
export type { GatesServiceDeps } from "./gates-service.js";
export { GatesServiceImpl } from "./gates-service.js";
// Phase 8: Graders
export { enrichWithApproachFeedback } from "./graders/approach-feedback.js";
export type {
  GradingOrchestrator,
  GradingOrchestratorDeps,
} from "./graders/grading-orchestrator.js";
export { GradingOrchestratorImpl } from "./graders/grading-orchestrator.js";
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
export { MasteryIndexer } from "./indexers/mastery-indexer.js";
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
export type { LessonAssessmentsServiceDeps } from "./lesson-assessments-service.js";
export { LessonAssessmentsServiceImpl } from "./lesson-assessments-service.js";
export type { LessonsServiceDeps } from "./lessons-service.js";
export { LessonsServiceImpl } from "./lessons-service.js";
// Phase 8: LLM helpers
export { extractJsonBlock } from "./llm-helpers.js";
export type { BktParams, BktState } from "./memory/bkt.js";
export { bktInitial, bktUpdate, DEFAULT_BKT, signalToObservation } from "./memory/bkt.js";
export type { DecayInput } from "./memory/decay.js";
export { applyDecay, applyDecayAt } from "./memory/decay.js";
export { applySignalsToConcept } from "./memory/mastery-writes.js";
export type { MemoryServiceDeps } from "./memory/memory-service.js";
export { MemoryServiceImpl } from "./memory/memory-service.js";
// Per-course progress aggregator
export type { ProgressServiceDeps } from "./progress-service.js";
export { ProgressServiceImpl, STUCK_MASTERY_THRESHOLD } from "./progress-service.js";
// Phase 17: QuickCheck service
export { QuickCheckServiceImpl } from "./quick-check-service.js";
// Workbench recommendation engine
export type { RecommendationServiceDeps } from "./recommendation-service.js";
export {
  humanize,
  RecommendationServiceImpl,
  reasonPracticeConcept,
  reasonQuickCheck,
  reasonResumeDraft,
  reasonResumeSession,
  reasonReviewCards,
  recencyOf,
  scorePracticeConcept,
  scoreResumeDraft,
  scoreResumeSession,
  scoreReviewCards,
} from "./recommendation-service.js";
// empty-session-cleanup: promotion registry
export type {
  SessionPromotionRegistry,
  SessionPromotionRegistryDeps,
  UnpromotedSessionState,
} from "./session/session-promotion-registry.js";
export {
  SessionNotRegisteredError,
  SessionPromotionRegistryImpl,
} from "./session/session-promotion-registry.js";
// empty-session-cleanup: sweep indexer
export type {
  SessionSweepConfig,
  SessionSweepIndexerDeps,
} from "./session/session-sweep-indexer.js";
export {
  SESSION_SWEEP_CONFIG_DEFAULTS,
  SessionSweepIndexer,
} from "./session/session-sweep-indexer.js";
export { SessionServiceImpl } from "./session-service.js";
// Phase 15a: Sketch service
export type { SketchServiceDeps } from "./sketch-service.js";
export { SketchServiceImpl } from "./sketch-service.js";
export { getOrCreateDefaultStudentId } from "./student.js";
// Phase 14: Tabs service
export type { TabsServiceDeps } from "./tabs-service.js";
export { TabsServiceImpl } from "./tabs-service.js";
// Content-renderer step 5: first-introduction term tracking
export type { TermFirstOccurrencesService } from "./term-first-occurrences-service.js";
export { createTermFirstOccurrencesService } from "./term-first-occurrences-service.js";
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
