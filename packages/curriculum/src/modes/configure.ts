import type { Mode } from "@praxis/core/types";
import { configureRoleFragment } from "./fragments/configure-role.js";
import { configureToolsFragment } from "./fragments/configure-tools.js";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";

/**
 * Configure mode — gated authoring and configuration surface.
 *
 * Requires the lock to be unlocked before session.start (enforced in
 * SessionServiceImpl.start for modeId === "configure"). Bootstrap mode
 * intentionally does NOT require unlock — first-run authoring is lock-free.
 *
 * Tool set: bootstrap mode's full tool set + all authoring tools + all
 * configure-mode memory tools. This mode subsumes bootstrap mode.
 *
 * uiSurface: "configure" — the /configure route with Course/Gates/Prompt/Memory tabs.
 */
export const configureMode: Mode = {
  id: "configure",
  label: "Configure",
  description:
    "Configurator mode for authoring courses, editing gates, customizing prompts, and managing student memory. Gated by lock code when set.",
  requiredRole: "configurator",
  promptFragments: [
    preambleFragment,
    configureRoleFragment,
    principlesFragment,
    configureToolsFragment,
    courseContextFragmentDefault, // fallback context — no active student course in configure
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    // ── Bootstrap / course-authoring tools (Phase 6 + 10 + 16) ──────────────
    "course.list_library_documents",
    "course.list_course_documents",
    "course.attach_document",
    "course.detach_document",
    "course.start_exploration",
    "course.show_draft",
    "course.edit_draft",
    "course.confirm_draft",
    "course.discard_draft",
    "course.list_canonical_packs",
    "course.use_canonical_pack",
    // Chunked-query tools (expressive-draft-api)
    "course.list_units",
    "course.list_lessons_in_unit",
    "course.get_lesson_detail",
    "course.list_dangling_refs",
    "retrieve_from_documents",
    // ── Authoring tools (Phase 11) ───────────────────────────────────────────
    "course.edit",
    "lesson.create",
    "lesson.edit",
    "lesson.delete",
    "gate.create",
    "gate.edit",
    "gate.delete",
    "gate.override",
    "prompt.override_fragment",
    "prompt.clear_fragment",
    "prompt.set_style",
    // ── Memory tools (Phase 11 configure subset) ─────────────────────────────
    "memory.reset_concept",
    "memory.clear_misconception",
    "memory.export",
    "memory.delete_all",
    // ── Dialog tools — structured choice questions ────────────────────────────
    "ask_student_question",
  ],
  uiSurface: "configure",
};
