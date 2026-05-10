export { askStudentQuestionTool } from "./ask-student-question.js";

import { askStudentQuestionTool } from "./ask-student-question.js";

/** All dialog tools — spread into toolDefinitions in services.ts. */
export const DIALOG_TOOLS = [askStudentQuestionTool] as const;
