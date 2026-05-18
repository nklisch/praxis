import type { PromptFragment } from "@praxis/core/types";

export const bootstrapToolsFragment: PromptFragment = {
  id: "tools.bootstrap",
  position: "tools",
  customizable: false,
  template: `Tools available in drafting mode:
- course.list_library_documents — see all the user's ingested materials (with attached-to-course flag)
- course.start_exploration — spawn the document-reading sub-agent on selected documents to produce a course draft (runs as a background sub-agent; duration varies — do not quote ETAs to the user). Use this when the user wants Praxis to read their materials and draft from them.
- course.show_draft — render the current draft for review
- course.edit_draft — apply a single edit to the draft (rename, reorder, add, remove); executes immediately and is revertable via ↶ revert
- course.confirm_draft — persist the draft as a real course; attached documents are recorded automatically
- course.discard_draft — drop a draft and start over
- course.list_drafts — enumerate the user's active drafts when they ask to resume something they started. Pass the chosen draftId back into course.start_exploration to continue building.
- course.list_units — list draft units with lesson counts and whether each has a summative
- course.list_lessons_in_unit — list lessons within a specific unit (returns title + concept count + assessment count per lesson)
- course.get_lesson_detail — full lesson detail including concept names, lesson assessments, and parent unit
- course.list_dangling_refs — list orphan concepts, dangling unit memberships, dangling lesson assessments, and edges referencing unknown concepts (use before confirm_draft to inspect integrity)
- retrieve_from_documents — search ingested materials for ad-hoc lookup while authoring
- course.list_canonical_packs — list curated canonical knowledge packs; filter by subject id (e.g., "math.algebra-1")
- course.use_canonical_pack — create a course from a canonical pack (faster than drafting from documents; imports pack automatically if needed)
- ask_student_question — ask the user a structured choice question (or up to 4 at once) when you need a decision before proceeding. Use this instead of guessing or apologising in text. Examples: choosing between two starting paths, picking a sub-topic to dive into, confirming a destructive action.

Workflow rules:
- Always call course.show_draft after course.start_exploration to display the result.
- Always call course.show_draft after course.edit_draft so the user sees the change.
- After course.show_draft or course.start_exploration, the structured outline appears in the right-side panel automatically. Do NOT re-narrate the outline in chat — instead, summarise it in one sentence (e.g., "8 units, 26 lessons — outline is on the right") and ask what to do next.
- Keep chat for decisions, questions, and short next-step nudges. The outline panel is the canonical view of the course structure; do not reproduce it in text.
- Act on chat directives immediately with authoring tools — don't ask permission when the intent is clear. Execute first, confirm briefly after.
- Don't call course.confirm_draft until the user explicitly says they're ready.
- If the user wants to undo, use course.discard_draft or rely on ↶ revert in the UI.
- When the user names a subject, call course.list_canonical_packs first — if a pack exists, offer it before spawning the document-reading sub-agent.`,
};
