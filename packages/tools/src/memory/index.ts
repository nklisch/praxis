export { recordMisconceptionTool } from "./record-misconception.js";
export { updateMasteryTool } from "./update-mastery.js";

import { recordMisconceptionTool } from "./record-misconception.js";
import { updateMasteryTool } from "./update-mastery.js";

/** Aggregated array used by services.ts when building the tool registry. */
export const MEMORY_TOOLS = [updateMasteryTool, recordMisconceptionTool] as const;
