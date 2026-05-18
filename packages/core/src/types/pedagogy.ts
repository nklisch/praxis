import type { Citation } from "./common.js";
import type { StrategyId, TechniqueId } from "./ids.js";

export interface PedagogyPack {
  version: string;
  signature: string;
  manifest: PedagogyManifest;
  strategies: TeachingStrategy[];
  studyTechniques: StudyTechnique[];
  metacognitivePrompts: MetacognitivePrompt[];
}

export interface PedagogyManifest {
  name: string;
  description: string;
  praxisCompatible: string; // semver range
  publishedAt: number;
  authors: string[];
}

export interface TeachingStrategy {
  id: StrategyId;
  name: string;
  description: string;
  applicability: {
    conceptKinds: string[];
    bloomsLevels: string[];
    cognitiveLoad: "low" | "medium" | "high";
  };
  promptFragment: string;
  citations: Citation[];
}

export interface StudyTechnique {
  id: TechniqueId;
  name: string;
  description: string;
  uiAffordances: string[];
  curriculum: { lessons: TechniqueLesson[] };
  citations: Citation[];
}

export interface TechniqueLesson {
  id: string;
  title: string;
  body: string;
  practicePromptIds: string[];
}

export type MetacognitivePromptTrigger =
  | "pre-reading"
  | "post-reading"
  | "pre-quiz"
  | "post-error"
  | "session-end";

export interface MetacognitivePrompt {
  id: string;
  trigger: MetacognitivePromptTrigger;
  template: string;
}

// ─── Phase 18: PedagogyPackService ───────────────────────────────────────────

/**
 * Read-only service over the loaded pedagogy pack. Synchronous accessors —
 * the pack is loaded once at boot and held in memory (~50 KB upper bound for v1).
 * When no pack file is available at runtime, every accessor returns empty arrays
 * or null (empty-pack mode). Implemented by `PedagogyPackServiceImpl` in
 * `@praxis/curriculum/pedagogy`.
 */
export interface PedagogyPackService {
  /** Returns the loaded pack, or `null` if no pack is available at runtime. */
  current(): PedagogyPack | null;

  /** All teaching strategies in the loaded pack (empty if no pack). */
  listStrategies(): readonly TeachingStrategy[];

  /** Lookup a teaching strategy by id. Returns `null` if no pack or unknown id. */
  getStrategy(id: StrategyId): TeachingStrategy | null;

  /** All study techniques in the loaded pack (empty if no pack). */
  listTechniques(): readonly StudyTechnique[];

  /** Lookup a study technique by id. Returns `null` if no pack or unknown id. */
  getTechnique(id: TechniqueId): StudyTechnique | null;

  /**
   * Metacognitive prompts in the loaded pack, optionally filtered by trigger.
   * Returns an empty array if no pack is loaded.
   */
  listMetacognitivePrompts(opts?: {
    trigger?: MetacognitivePromptTrigger;
  }): readonly MetacognitivePrompt[];
}
