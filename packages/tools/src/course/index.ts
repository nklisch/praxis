export { attachDocumentTool } from "./attach-document.js";
export { confirmDraftTool } from "./confirm-draft.js";
export { currentConceptTool } from "./current-concept.js";
export { detachDocumentTool } from "./detach-document.js";
export { discardDraftTool } from "./discard-draft.js";
export { draftAddConceptTool } from "./draft-add-concept.js";
export { draftAddEdgeTool } from "./draft-add-edge.js";
export { draftAddLessonTool } from "./draft-add-lesson.js";
export { draftAddLessonAssessmentTool } from "./draft-add-lesson-assessment.js";
export { draftAddUnitTool } from "./draft-add-unit.js";
export { draftFinalizeTool } from "./draft-finalize.js";
export { draftInitTool } from "./draft-init.js";
export { draftRemoveConceptTool } from "./draft-remove-concept.js";
export { draftRemoveLessonTool } from "./draft-remove-lesson.js";
export { draftSetAssessmentPlanTool } from "./draft-set-assessment-plan.js";
export { draftSetMetadataTool } from "./draft-set-metadata.js";
export { editDraftTool } from "./edit-draft.js";
export { listCanonicalPacksTool } from "./list-canonical-packs.js";
export { listCourseDocumentsTool } from "./list-course-documents.js";
export { listLibraryDocumentsTool } from "./list-library-documents.js";
export { markStudiedTool } from "./mark-studied.js";
export { showDraftTool } from "./show-draft.js";
export { startExplorationTool } from "./start-exploration.js";
export { startLessonTool } from "./start-lesson.js";
export { useCanonicalPackTool } from "./use-canonical-pack.js";
export { whatCanITeachTool } from "./what-can-i-teach.js";

import { attachDocumentTool } from "./attach-document.js";
import { confirmDraftTool } from "./confirm-draft.js";
import { currentConceptTool } from "./current-concept.js";
import { detachDocumentTool } from "./detach-document.js";
import { discardDraftTool } from "./discard-draft.js";
import { draftAddConceptTool } from "./draft-add-concept.js";
import { draftAddEdgeTool } from "./draft-add-edge.js";
import { draftAddLessonTool } from "./draft-add-lesson.js";
import { draftAddLessonAssessmentTool } from "./draft-add-lesson-assessment.js";
import { draftAddUnitTool } from "./draft-add-unit.js";
import { draftFinalizeTool } from "./draft-finalize.js";
import { draftInitTool } from "./draft-init.js";
import { draftRemoveConceptTool } from "./draft-remove-concept.js";
import { draftRemoveLessonTool } from "./draft-remove-lesson.js";
import { draftSetAssessmentPlanTool } from "./draft-set-assessment-plan.js";
import { draftSetMetadataTool } from "./draft-set-metadata.js";
import { editDraftTool } from "./edit-draft.js";
import { listCanonicalPacksTool } from "./list-canonical-packs.js";
import { listCourseDocumentsTool } from "./list-course-documents.js";
import { listLibraryDocumentsTool } from "./list-library-documents.js";
import { markStudiedTool } from "./mark-studied.js";
import { showDraftTool } from "./show-draft.js";
import { startExplorationTool } from "./start-exploration.js";
import { startLessonTool } from "./start-lesson.js";
import { useCanonicalPackTool } from "./use-canonical-pack.js";
import { whatCanITeachTool } from "./what-can-i-teach.js";

/** Aggregated array used by services.ts when building the tool registry. */
export const COURSE_TOOLS = [
  // Library + course-doc tools
  listLibraryDocumentsTool,
  listCourseDocumentsTool,
  attachDocumentTool,
  detachDocumentTool,
  // Navigation tools
  whatCanITeachTool,
  startLessonTool,
  currentConceptTool,
  markStudiedTool,
  // Phase 16: explorer entry point + draft mutation tools
  startExplorationTool,
  draftInitTool,
  draftSetMetadataTool,
  draftAddConceptTool,
  draftRemoveConceptTool,
  draftAddEdgeTool,
  draftAddLessonTool,
  draftRemoveLessonTool,
  draftFinalizeTool,
  // Phase 16: unit + assessment scaffold tools (explorer-only; grouped together)
  draftAddUnitTool,
  draftSetAssessmentPlanTool,
  draftAddLessonAssessmentTool,
  // Draft lifecycle (user-facing)
  showDraftTool,
  editDraftTool,
  confirmDraftTool,
  discardDraftTool,
  listCanonicalPacksTool,
  useCanonicalPackTool,
] as const;
