export { createNoteTool } from "./create.js";
export { fromSessionSummaryTool } from "./from-session-summary.js";
export { FROM_SESSION_SUMMARY_PROMPT } from "./from-session-summary-prompt.js";
export { listNotesTool } from "./list.js";
export { NoteBodySchema, OutlineNodeSchema } from "./schema.js";
export { showNoteTool } from "./show.js";
export { updateNoteTool } from "./update.js";

import { createNoteTool } from "./create.js";
import { fromSessionSummaryTool } from "./from-session-summary.js";
import { listNotesTool } from "./list.js";
import { showNoteTool } from "./show.js";
import { updateNoteTool } from "./update.js";

/** Aggregated array used by services.ts when building the tool registry. */
export const NOTE_TOOLS = [
  createNoteTool,
  updateNoteTool,
  showNoteTool,
  listNotesTool,
  fromSessionSummaryTool,
] as const;
