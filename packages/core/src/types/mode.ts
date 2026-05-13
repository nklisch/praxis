import type { EngineEvent } from "./engine.js";
import type { ConceptId, CourseId } from "./ids.js";

export type UISurfaceId =
  | "chat"
  | "submission"
  | "progress-map"
  | "workspace"
  | "concept-map"
  | "configure";

export interface ArtifactScope {
  courseIds?: CourseId[];
  conceptIds?: ConceptId[];
  includeUnlocked?: boolean;
}

export type PromptFragmentPosition =
  | "preamble"
  | "role"
  | "principles"
  | "tools"
  | "context"
  | "constraints"
  | "user-global" // ← user-authored cross-mode fragment (Settings)
  | "user-append" // ← user-authored per-mode append (Configure)
  | "postamble";

export interface PromptFragment {
  id: string;
  position: PromptFragmentPosition;
  template: string;
  customizable: boolean;
}

export interface Mode {
  id: string;
  label: string;
  /**
   * Lowercase, italic-serif display name used in the in-session header
   * and the tab strip — e.g. "teach", "course design". Distinct from
   * `label` (Title Case admin context). Matches `ModeMeta.name` in
   * the UI by convention.
   */
  displayName: string;
  description: string;
  requiredRole: "student" | "configurator";
  promptFragments: PromptFragment[];
  toolNames: string[];
  uiSurface: UISurfaceId;
  artifactScope?: ArtifactScope;
  onTurnEnd?(events: EngineEvent[]): Promise<void>;
}
