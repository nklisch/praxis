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
export { ConfigServiceImpl } from "./config-service.js";
export { DrizzleDocumentsReader } from "./documents-reader-impl.js";
export type { DocumentsServiceDeps } from "./documents-service.js";
export { DocumentsServiceImpl } from "./documents-service.js";
// Phase 8: Graders
export { enrichWithApproachFeedback } from "./graders/approach-feedback.js";
export { buildGraderRegistry } from "./graders/registry.js";
export type { RunRubricAgentInput } from "./graders/rubric-agent.js";
export { runRubricAgent } from "./graders/rubric-agent.js";
export type { GraderContext, GraderResult, GraderServices, ItemGrader } from "./graders/types.js";
export type { MasteryIndexerDeps } from "./indexers/mastery-indexer.js";
export { applySignalsToConcept, MasteryIndexer } from "./indexers/mastery-indexer.js";
export type { MisconceptionIndexerDeps } from "./indexers/misconception-indexer.js";
export { MisconceptionIndexer, upsertMisconception } from "./indexers/misconception-indexer.js";
// Phase 7: Memory service + indexers
export type { IndexerOrchestratorDeps } from "./indexers/orchestrator.js";
export { IndexerOrchestratorImpl } from "./indexers/orchestrator.js";
// Phase 8: LLM helpers
export { extractJsonBlock } from "./llm-helpers.js";
export type { BktParams, BktState } from "./memory/bkt.js";
export { bktInitial, bktUpdate, DEFAULT_BKT, signalToObservation } from "./memory/bkt.js";
export type { DecayInput } from "./memory/decay.js";
export { applyDecay, applyDecayAt } from "./memory/decay.js";
export type { MemoryServiceDeps } from "./memory/memory-service.js";
export { MemoryServiceImpl } from "./memory/memory-service.js";
export { SessionServiceImpl } from "./session-service.js";
export { getOrCreateDefaultStudentId } from "./student.js";
export type { ServiceDeps } from "./types.js";
