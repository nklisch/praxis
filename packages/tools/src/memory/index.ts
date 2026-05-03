// ── Phase 11: configure-mode memory tools ────────────────────────────────────
export { clearMisconceptionTool } from "./clear-misconception.js";
export { memoryDeleteAllTool } from "./delete-all.js";
export { memoryExportTool } from "./export.js";
export { recordMisconceptionTool } from "./record-misconception.js";
export { resetConceptTool } from "./reset-concept.js";
export { updateMasteryTool } from "./update-mastery.js";

import { clearMisconceptionTool } from "./clear-misconception.js";
import { memoryDeleteAllTool } from "./delete-all.js";
import { memoryExportTool } from "./export.js";
import { recordMisconceptionTool } from "./record-misconception.js";
import { resetConceptTool } from "./reset-concept.js";
import { updateMasteryTool } from "./update-mastery.js";

/** Phase 7 teach-mode tools — safe for the active learning surface. */
export const MEMORY_TOOLS = [updateMasteryTool, recordMisconceptionTool] as const;

/**
 * Phase 11 configure-mode memory tools — available only in configure mode.
 * These tools delegate through AuthoringServiceImpl for audit logging.
 */
export const CONFIGURE_MEMORY_TOOLS = [
  resetConceptTool,
  clearMisconceptionTool,
  memoryExportTool,
  memoryDeleteAllTool,
] as const;
