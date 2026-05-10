export { quickCheckConfidenceTool } from "./confidence.js";
export { quickCheckMatchingTool } from "./matching.js";
export { quickCheckMultiSelectTool } from "./multi-select.js";
export { quickCheckShortAnswerTool } from "./short-answer.js";
export { quickCheckSingleChoiceTool } from "./single-choice.js";

import { quickCheckConfidenceTool } from "./confidence.js";
import { quickCheckMatchingTool } from "./matching.js";
import { quickCheckMultiSelectTool } from "./multi-select.js";
import { quickCheckShortAnswerTool } from "./short-answer.js";
import { quickCheckSingleChoiceTool } from "./single-choice.js";

/** All five Phase 17 quick_check.* tools. Spread into toolDefinitions in services.ts. */
export const QUICK_CHECK_TOOLS = [
  quickCheckSingleChoiceTool,
  quickCheckMultiSelectTool,
  quickCheckShortAnswerTool,
  quickCheckMatchingTool,
  quickCheckConfidenceTool,
] as const;
