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

export interface QuestionConstraints {
  promptMaxWords?: number;
  choiceMaxWords?: number;
  choiceCount?: number;
  multiSelectCap?: number;
}

export interface RenderToggles {
  callouts?: boolean;
  figures?: boolean;
  definitions?: boolean;
  conceptRefs?: boolean;
  glossary?: boolean;
  bareGlyphMath?: boolean;
  unitAutoDetect?: boolean;
  filePathAutoDetect?: boolean;
}

export const DEFAULT_RENDER_TOGGLES: Required<RenderToggles> = Object.freeze({
  callouts: true,
  figures: true,
  definitions: true,
  conceptRefs: true,
  glossary: true,
  bareGlyphMath: true,
  unitAutoDetect: true,
  filePathAutoDetect: true,
});

export function resolveRenderToggles(mode: Pick<Mode, "renderToggles">): Required<RenderToggles> {
  const override = mode.renderToggles ?? {};
  return {
    callouts: override.callouts ?? DEFAULT_RENDER_TOGGLES.callouts,
    figures: override.figures ?? DEFAULT_RENDER_TOGGLES.figures,
    definitions: override.definitions ?? DEFAULT_RENDER_TOGGLES.definitions,
    conceptRefs: override.conceptRefs ?? DEFAULT_RENDER_TOGGLES.conceptRefs,
    glossary: override.glossary ?? DEFAULT_RENDER_TOGGLES.glossary,
    bareGlyphMath: override.bareGlyphMath ?? DEFAULT_RENDER_TOGGLES.bareGlyphMath,
    unitAutoDetect: override.unitAutoDetect ?? DEFAULT_RENDER_TOGGLES.unitAutoDetect,
    filePathAutoDetect: override.filePathAutoDetect ?? DEFAULT_RENDER_TOGGLES.filePathAutoDetect,
  };
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
  questionConstraints?: QuestionConstraints;
  renderToggles?: RenderToggles;
  onTurnEnd?(events: EngineEvent[]): Promise<void>;
}
