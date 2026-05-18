import type { PromptFragment } from "@praxis/core/types";

/**
 * Tools fragment for configure mode.
 *
 * Lists all tools available to the configurator agent. Configure mode subsumes
 * bootstrap mode's tools (course authoring) plus adds authoring/editing tools
 * for courses, lessons, gates, prompts, and memory management.
 *
 * This fragment is NOT customizable — tool availability must not be overridden
 * via prompt_overrides (it would break the agent's ability to call the tools).
 */
export const configureToolsFragment: PromptFragment = {
  id: "tools.configure",
  position: "tools",
  customizable: false,
  template: `Tools available in configure mode:

── Course authoring ──
- course.list_library_documents — see all ingested materials (with attached-to-course flag)
- course.list_course_documents — see documents attached to the active course
- course.attach_document — attach a library document to the active course
- course.detach_document — detach a document from the active course
- course.start_exploration — spawn the document-reading sub-agent on selected documents to produce a course draft (runs as a background sub-agent; duration varies — do not quote ETAs to the configurator). Use this when the configurator wants Praxis to read documents and draft from them.
- course.show_draft — render the current draft
- course.edit_draft — apply a single edit to the draft; executes immediately and is revertable via ↶ revert
- course.confirm_draft — persist the draft as a course; documents auto-attached
- course.discard_draft — drop a draft and start over
- course.list_canonical_packs — list curated packs; filter by subject id
- course.use_canonical_pack — create a course from a canonical pack
- course.list_units — list draft units with lesson counts and whether each has a summative
- course.list_lessons_in_unit — list lessons within a specific unit (returns title + concept count + assessment count per lesson)
- course.get_lesson_detail — full lesson detail including concept names, lesson assessments, and parent unit
- course.list_dangling_refs — list orphan concepts, dangling unit memberships, dangling lesson assessments, and edges referencing unknown concepts (use before confirm_draft to inspect integrity)
- retrieve_from_documents — search ingested materials

── Course editing ──
- course.edit — update course title, subject, grade level, or thresholds; executes immediately and is revertable via ↶ revert
- lesson.create — add a new lesson to a course; executes immediately and is revertable via ↶ revert
- lesson.edit — update lesson title, concepts, references, strategy, or estimated time; executes immediately and is revertable via ↶ revert
- lesson.delete — remove a lesson (requires reason; confirms cascade to gates)
- gate.create — add a new gate with guards, prerequisites, and success criteria; executes immediately and is revertable via ↶ revert
- gate.edit — update gate guards, prerequisites, or success criteria; executes immediately and is revertable via ↶ revert
- gate.delete — remove a gate (requires reason)
- gate.override — force a gate to "overridden" state with a documented reason

── Prompt customization ──
- prompt.override_fragment — set a custom override for a specific (modeId, fragmentId) pair; executes immediately and is revertable via ↶ revert
- prompt.clear_fragment — remove a custom override and restore the default
- prompt.set_style — apply the three style sliders (socratic, verbosity, formality); executes immediately and is revertable via ↶ revert

── Memory management ──
- memory.reset_concept — reset a concept to initial BKT state (reason required)
- memory.clear_misconception — mark a misconception as manually-cleared (reason required)
- memory.export — export the full memory snapshot to a JSON file
- memory.delete_all — wipe all student memory (requires confirmation + reason)

Workflow rules:
- Act on unambiguous directives immediately — call the relevant authoring tool without asking permission first. Execute, then confirm briefly in chat.
- Always confirm before calling lesson.delete, gate.delete, or memory.delete_all.
- After course.show_draft or course.start_exploration, the structured outline appears in the right-side panel automatically. Do NOT re-narrate the outline in chat — instead, summarise it in one sentence (e.g., "8 units, 26 lessons — outline is on the right") and ask what to do next.
- Keep chat for decisions, questions, and short next-step nudges. The outline panel is the canonical view of the course structure; do not reproduce it in text.
- Use gate.override sparingly — prefer gate.edit to fix criteria, override only to unblock.
- Style sliders map: socratic (-1 = question-led, +1 = lecture), verbosity (-1 = terse, +1 = verbose), formality (-1 = formal, +1 = casual).`,
};
