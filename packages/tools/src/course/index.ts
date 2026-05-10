// Note: `startExplorationTool` is intentionally NOT re-exported from this
// barrel. It imports `runConceptExplorer` from `@praxis/curriculum/bootstrap`,
// which makes any consumer that grabs it via this barrel pull in curriculum —
// and curriculum's own tests then load `@praxis/tools/course` while it's
// already partially loaded, leaving some tool bindings undefined.
//
// Consumers that need `startExplorationTool` (currently only `services.ts`)
// import it directly from `./start-exploration.js`.

import { attachDocumentTool } from "./attach-document.js";
import { confirmDraftTool } from "./confirm-draft.js";
import { currentConceptTool } from "./current-concept.js";
import { detachDocumentTool } from "./detach-document.js";
import { discardDraftTool } from "./discard-draft.js";
import { draftAddConceptsTool } from "./draft-add-concepts.js";
import { draftAddEdgesTool } from "./draft-add-edges.js";
import { draftAddLessonAssessmentsTool } from "./draft-add-lesson-assessments.js";
import { draftAddLessonsTool } from "./draft-add-lessons.js";
import { draftAddUnitTool } from "./draft-add-unit.js";
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
import { startLessonTool } from "./start-lesson.js";
import { useCanonicalPackTool } from "./use-canonical-pack.js";
import { whatCanITeachTool } from "./what-can-i-teach.js";

export {
  attachDocumentTool,
  confirmDraftTool,
  currentConceptTool,
  detachDocumentTool,
  discardDraftTool,
  draftAddConceptsTool,
  draftAddEdgesTool,
  draftAddLessonAssessmentsTool,
  draftAddLessonsTool,
  draftAddUnitTool,
  draftInitTool,
  draftRemoveConceptTool,
  draftRemoveLessonTool,
  draftSetAssessmentPlanTool,
  draftSetMetadataTool,
  editDraftTool,
  listCanonicalPacksTool,
  listCourseDocumentsTool,
  listLibraryDocumentsTool,
  markStudiedTool,
  showDraftTool,
  startLessonTool,
  useCanonicalPackTool,
  whatCanITeachTool,
};

/**
 * Aggregated array used by services.ts when building the tool registry.
 * `startExplorationTool` is appended by services.ts (imported separately) —
 * see the note at the top of this file for why it isn't included here.
 */
export const COURSE_TOOLS = [
  // Library + course-doc tools.
  listLibraryDocumentsTool,
  listCourseDocumentsTool,
  attachDocumentTool,
  detachDocumentTool,
  // Navigation tools.
  whatCanITeachTool,
  startLessonTool,
  currentConceptTool,
  markStudiedTool,
  // Bootstrap draft mutation tools (the explorer entry point lives in a
  // separate file — see top-of-file note).
  // All add-many tools take arrays — pass a length-1 array to add a single
  // item. There are no singular variants.
  draftInitTool,
  draftSetMetadataTool,
  draftAddConceptsTool,
  draftRemoveConceptTool,
  draftAddEdgesTool,
  draftAddLessonsTool,
  draftRemoveLessonTool,
  // Unit + assessment scaffold tools.
  draftAddUnitTool,
  draftSetAssessmentPlanTool,
  draftAddLessonAssessmentsTool,
  // Draft lifecycle (user-facing).
  showDraftTool,
  editDraftTool,
  confirmDraftTool,
  discardDraftTool,
  listCanonicalPacksTool,
  useCanonicalPackTool,
] as const;
