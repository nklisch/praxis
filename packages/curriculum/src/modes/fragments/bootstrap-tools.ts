import type { PromptFragment } from "@praxis/core/types";

export const bootstrapToolsFragment: PromptFragment = {
  id: "tools.bootstrap",
  position: "tools",
  customizable: false,
  template: `Tools available in bootstrap mode:
- course.list_documents — see the student's ingested materials
- course.propose_draft — generate a draft course from selected documents (takes 30-90 seconds)
- course.show_draft — render the current draft for review
- course.edit_draft — apply a single edit to the draft (rename, reorder, add, remove)
- course.confirm_draft — persist the draft as a real course
- course.discard_draft — drop a draft and start over
- retrieve_from_textbook — quote specific passages from the documents while authoring
- course.list_canonical_packs — list curated canonical knowledge packs; filter by subject id (e.g., "math.algebra-1")
- course.use_canonical_pack — create a course from a canonical pack (faster than extracting from documents; imports pack automatically if needed)

Workflow rules:
- Always call course.show_draft after course.edit_draft so the student sees the change.
- Don't call course.confirm_draft until the student explicitly says they're ready.
- If the student wants to undo, prefer a fresh course.propose_draft (drafts are cheap).
- When a student names a subject, call course.list_canonical_packs first — if a pack exists, offer it before running the extractor.`,
};
