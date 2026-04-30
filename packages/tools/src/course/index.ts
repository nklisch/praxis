export { confirmDraftTool } from "./confirm-draft.js";
export { currentConceptTool } from "./current-concept.js";
export { discardDraftTool } from "./discard-draft.js";
export { editDraftTool } from "./edit-draft.js";
export { listCanonicalPacksTool } from "./list-canonical-packs.js";
export { listDocumentsTool } from "./list-documents.js";
export { markStudiedTool } from "./mark-studied.js";
export { proposeDraftTool } from "./propose-draft.js";
export { showDraftTool } from "./show-draft.js";
export { startLessonTool } from "./start-lesson.js";
export { useCanonicalPackTool } from "./use-canonical-pack.js";
export { whatCanITeachTool } from "./what-can-i-teach.js";

import { confirmDraftTool } from "./confirm-draft.js";
import { currentConceptTool } from "./current-concept.js";
import { discardDraftTool } from "./discard-draft.js";
import { editDraftTool } from "./edit-draft.js";
import { listCanonicalPacksTool } from "./list-canonical-packs.js";
import { listDocumentsTool } from "./list-documents.js";
import { markStudiedTool } from "./mark-studied.js";
import { proposeDraftTool } from "./propose-draft.js";
import { showDraftTool } from "./show-draft.js";
import { startLessonTool } from "./start-lesson.js";
import { useCanonicalPackTool } from "./use-canonical-pack.js";
import { whatCanITeachTool } from "./what-can-i-teach.js";

/** Aggregated array used by services.ts when building the tool registry. */
export const COURSE_TOOLS = [
  whatCanITeachTool,
  startLessonTool,
  currentConceptTool,
  markStudiedTool,
  listDocumentsTool,
  proposeDraftTool,
  showDraftTool,
  editDraftTool,
  confirmDraftTool,
  discardDraftTool,
  listCanonicalPacksTool, // ← Phase 10
  useCanonicalPackTool, // ← Phase 10
] as const;
