export { courseEditTool } from "./course/edit.js";
export { lessonCreateTool } from "./lesson/create.js";
export { lessonEditTool } from "./lesson/edit.js";
export { lessonDeleteTool } from "./lesson/delete.js";
export { gateCreateTool } from "./gate/create.js";
export { gateEditTool } from "./gate/edit.js";
export { gateDeleteTool } from "./gate/delete.js";
export { gateOverrideTool } from "./gate/override.js";
export { promptOverrideFragmentTool } from "./prompt/override-fragment.js";
export { promptClearFragmentTool } from "./prompt/clear-fragment.js";
export { promptSetStyleTool } from "./prompt/set-style.js";

import { courseEditTool } from "./course/edit.js";
import { gateCreateTool } from "./gate/create.js";
import { gateDeleteTool } from "./gate/delete.js";
import { gateEditTool } from "./gate/edit.js";
import { gateOverrideTool } from "./gate/override.js";
import { lessonCreateTool } from "./lesson/create.js";
import { lessonDeleteTool } from "./lesson/delete.js";
import { lessonEditTool } from "./lesson/edit.js";
import { promptClearFragmentTool } from "./prompt/clear-fragment.js";
import { promptOverrideFragmentTool } from "./prompt/override-fragment.js";
import { promptSetStyleTool } from "./prompt/set-style.js";

/**
 * All authoring tools for configure mode.
 * Registered by buildServices() in packages/desktop/electron/main/services.ts.
 */
export const AUTHORING_TOOLS = [
  courseEditTool,
  lessonCreateTool,
  lessonEditTool,
  lessonDeleteTool,
  gateCreateTool,
  gateEditTool,
  gateDeleteTool,
  gateOverrideTool,
  promptOverrideFragmentTool,
  promptClearFragmentTool,
  promptSetStyleTool,
] as const;
