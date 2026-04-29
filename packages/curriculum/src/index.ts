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
