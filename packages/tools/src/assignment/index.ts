export { createAssignmentTool } from "./create.js";
export { readGradeTool } from "./read-grade.js";
export { showAssignmentTool } from "./show.js";

import { createAssignmentTool } from "./create.js";
import { readGradeTool } from "./read-grade.js";
import { showAssignmentTool } from "./show.js";

/** Tools the tutor (teach mode) uses to author assignments. */
export const ASSIGNMENT_TUTOR_TOOLS = [createAssignmentTool] as const;

/** Tools used during taking an assignment (quiz / homework / exam modes). */
export const ASSIGNMENT_TAKE_TOOLS = [showAssignmentTool, readGradeTool] as const;
