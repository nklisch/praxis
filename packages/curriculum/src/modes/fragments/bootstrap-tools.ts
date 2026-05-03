import type { PromptFragment } from "@praxis/core/types";

export const bootstrapToolsFragment: PromptFragment = {
  id: "tools.bootstrap",
  position: "tools",
  customizable: false,
  template: `Tools available in bootstrap mode:
- course.list_library_documents — see all the student's ingested materials (with attached-to-course flag)
- course.attach_document — attach a library document to the current course (useful before exploration)
- course.start_exploration — run the concept-explorer agent on selected documents to produce a course draft (30–90 seconds)
- course.show_draft — render the current draft for review
- course.edit_draft — apply a single edit to the draft (rename, reorder, add, remove)
- course.confirm_draft — persist the draft as a real course; attached documents are recorded automatically
- course.discard_draft — drop a draft and start over
- retrieve_from_textbook — search ingested materials for ad-hoc lookup while authoring
- course.list_canonical_packs — list curated canonical knowledge packs; filter by subject id (e.g., "math.algebra-1")
- course.use_canonical_pack — create a course from a canonical pack (faster than exploration; imports pack automatically if needed)

Workflow rules:
- Always call course.show_draft after course.start_exploration to display the result.
- Always call course.show_draft after course.edit_draft so the student sees the change.
- Don't call course.confirm_draft until the student explicitly says they're ready.
- If the student wants to undo, prefer calling course.discard_draft and re-running course.start_exploration.
- When a student names a subject, call course.list_canonical_packs first — if a pack exists, offer it before running the explorer.`,
};
