/**
 * Phase 16: exam-mode tools.
 *
 * `EXAM_TOOLS` is the array of ToolDefinition instances that belong
 * exclusively to exam mode. Wired into `toolDefinitions` in services.ts.
 */
export { clarificationTool } from "./clarification.js";

import type { ToolDefinition } from "@praxis/core/types";
import type { z } from "zod";
import { clarificationTool } from "./clarification.js";

export const EXAM_TOOLS: ToolDefinition<z.ZodType, z.ZodType>[] = [clarificationTool];
