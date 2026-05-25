import type { Mode } from "@praxis/core/types";
import { DEFAULT_QUESTION_CONSTRAINTS_BY_MODE, FALLBACK_QUESTION_CONSTRAINTS } from "../question-constraints.js";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { courseCreateRoleFragment } from "./fragments/course-create-role.js";
import { courseCreateToolsFragment } from "./fragments/course-create-tools.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { questionToolFragment } from "./fragments/question-tool.js";

/**
 * Course-create mode — conversational course-authoring.
 *
 * The student drops materials into Praxis (via Phase 5 ingestion), then opens
 * a course-create session to propose, refine, and confirm a course outline.
 * This mode is available without lock; Phase 11's `configure` mode subsumes it
 * (lock-gated, with full gate / prompt / memory editors).
 *
 * Tool names: the 6 draft-authoring tools + retrieve_from_documents for ad-hoc
 * lookup while authoring. Navigation tools (what_can_i_teach, etc.) are NOT
 * included — no confirmed course exists at course-create time.
 */
export const courseCreateMode: Mode = {
  id: "course-create",
  label: "Design a course",
  displayName: "course design",
  description: "Conversational mode for designing a new course from your materials.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    courseCreateRoleFragment,
    principlesFragment,
    courseCreateToolsFragment,
    courseContextFragmentDefault, // always the fallback — no active course in course-create
    constraintsFragment,
    questionToolFragment(DEFAULT_QUESTION_CONSTRAINTS_BY_MODE["course-create"] ?? FALLBACK_QUESTION_CONSTRAINTS, "Course Design"), // ← question caps + content conventions
    postambleFragment,
  ],
  toolNames: [
    // Library tools (attach_document omitted — course-create sessions have no courseId; persistDraft handles attachment at confirm time)
    "course.list_library_documents",
    // Canonical packs (Phase 10) — unchanged
    "course.list_canonical_packs",
    "course.use_canonical_pack",
    // Phase 16: drafter entry point (replaces propose_draft)
    "course.start_drafting",
    // Draft lifecycle
    "course.show_draft",
    "course.edit_draft",
    "course.confirm_draft",
    "course.discard_draft",
    // Draft enumeration — student-facing resume affordance.
    "course.list_drafts",
    // Chunked-query tools (expressive-draft-api)
    "course.list_units",
    "course.list_lessons_in_unit",
    "course.get_lesson_detail",
    "course.list_dangling_refs",
    // Retrieval — for ad-hoc lookup by the tutor (NOT the drafter; drafter has its own registry)
    "retrieve_from_documents",
    // Dialog — structured choice questions the model poses to the student
    "ask_student_question",
  ],
  uiSurface: "chat",
};
