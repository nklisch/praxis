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
