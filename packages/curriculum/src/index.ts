// @praxis/curriculum — populated in Phase 2.
export const PACKAGE_NAME = "@praxis/curriculum" as const;
export {
  type ComposeBriefInput,
  type ComposedBrief,
  type ComposeSystemPromptInput,
  composeBrief,
  composeSystemPrompt,
} from "./brief/compose.js";
export { getMode, listModes, requireMode, teachMode } from "./modes/index.js";

// Phase 10: Pack format, import service, concept embeddings store.
export type {
  ConceptEmbeddingMatch,
  ConceptEmbeddingsStore,
  ConceptEmbeddingUpsertInput,
  ImportedPack,
  PackConcept,
  PackEdge,
  PackManifest,
  PackSummary,
} from "./packs/index.js";
export {
  PackConceptSchema,
  PackEdgeSchema,
  type PackImportServiceDeps,
  PackImportServiceImpl,
  type PackManifestInput,
  type PackManifestOutput,
  PackManifestSchema,
  SqliteConceptEmbeddingsStore,
} from "./packs/index.js";

// Question constraints: per-mode defaults and merge helper.
export {
  DEFAULT_QUESTION_CONSTRAINTS_BY_MODE,
  FALLBACK_QUESTION_CONSTRAINTS,
  resolveQuestionConstraints,
} from "./question-constraints.js";

// Phase 10: Adaptive router.
export {
  type ConceptCandidate,
  DEFAULT_ROUTER_CONFIG,
  type RouterConfig,
  type RouterInput,
  type RouterReason,
  type RouterSuggestion,
  suggestNext,
} from "./router/index.js";
