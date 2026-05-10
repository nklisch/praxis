import type { Mode } from "@praxis/core/types";
import { bootstrapRoleFragment } from "./fragments/bootstrap-role.js";
import { bootstrapToolsFragment } from "./fragments/bootstrap-tools.js";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";

/**
 * Bootstrap mode — conversational course-authoring.
 *
 * The student drops materials into Praxis (via Phase 5 ingestion), then opens
 * a bootstrap session to propose, refine, and confirm a course outline.
 * This mode is available without lock; Phase 11's `configure` mode subsumes it
 * (lock-gated, with full gate / prompt / memory editors).
 *
 * Tool names: the 6 draft-authoring tools + retrieve_from_textbook for ad-hoc
 * lookup while authoring. Navigation tools (what_can_i_teach, etc.) are NOT
 * included — no confirmed course exists at bootstrap time.
 */
export const bootstrapMode: Mode = {
  id: "bootstrap",
  label: "Bootstrap a course",
  description: "Conversational mode for authoring a new course from ingested documents.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    bootstrapRoleFragment,
    principlesFragment,
    bootstrapToolsFragment,
    courseContextFragmentDefault, // always the fallback — no active course in bootstrap
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    // Library + course-document tools
    "course.list_library_documents",
    "course.attach_document",
    // Canonical packs (Phase 10) — unchanged
    "course.list_canonical_packs",
    "course.use_canonical_pack",
    // Phase 16: explorer entry point (replaces propose_draft)
    "course.start_exploration",
    // Draft lifecycle
    "course.show_draft",
    "course.edit_draft",
    "course.confirm_draft",
    "course.discard_draft",
    // Retrieval — for ad-hoc lookup by the tutor (NOT the explorer; explorer has its own registry)
    "retrieve_from_textbook",
    // Dialog — structured choice questions the model poses to the student
    "ask_student_question",
  ],
  uiSurface: "chat",
};
