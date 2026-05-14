---
id: gate-docs-curriculum-bootstrap-tools-list-drafts
kind: story
stage: done
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: docs
created: 2026-05-14
updated: 2026-05-14
---

# CURRICULUM.md bootstrap-mode tools list omits `course.list_drafts` even though it's now registered for the bootstrap mode

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CURRICULUM.md:117`
- Code: `packages/curriculum/src/modes/bootstrap.ts:51`, `packages/tools/src/course/list-drafts.ts:26-27`

## Current doc text
> Tools: `course.list_library_documents`, `course.attach_document`, `course.list_canonical_packs`, `course.use_canonical_pack`, `course.start_exploration`, `course.show_draft`, `course.edit_draft`, `course.confirm_draft`, `course.discard_draft`, `retrieve_from_documents`. The single-shot `course.propose_draft` is gone (Phase 16 replaced it with the agentic `course.start_exploration` entry point). See `packages/curriculum/src/modes/bootstrap.ts` for the canonical list.

## Reality
Bootstrap-mode `toolNames` also includes `course.list_drafts`
(`packages/curriculum/src/modes/bootstrap.ts:51`) — the new
student-facing resume affordance, implemented in
`packages/tools/src/course/list-drafts.ts`. (Several other tools —
`course.list_units`, `course.list_lessons_in_unit`,
`course.get_lesson_detail`, `course.list_dangling_refs`,
`ask_student_question` — are also in the actual list but predate
v0.1.2; only `course.list_drafts` is the v0.1.2 addition flagged here.)

## Required edit
Add `course.list_drafts` to the tools enumeration in line 117. Keep
the "See packages/curriculum/src/modes/bootstrap.ts for the canonical
list" pointer so the SSOT remains the code.

## Implementation
Added `course.list_drafts` to the bootstrap-mode tools enumeration in `docs/CURRICULUM.md:117`, positioned after `course.discard_draft` (grouping it with the other draft-management tools: show, edit, confirm, discard, list_drafts). The "See packages/curriculum/src/modes/bootstrap.ts for the canonical list" pointer is preserved. No other changes were made — the predates-v0.1.2 tools remain intentionally omitted per the story's design-flaw escape hatch.

## Review (2026-05-14)

Approve.

Verified all three lenses:

1. **Placement** — `course.list_drafts` inserted after `course.discard_draft` at `docs/CURRICULUM.md:117`, within the draft-management group (show, edit, confirm, discard, list_drafts) and before `retrieve_from_documents`. Grouping is correct.

2. **Code cross-check** — `packages/curriculum/src/modes/bootstrap.ts:51` confirms `"course.list_drafts"` is in `toolNames`, annotated `// Draft enumeration — student-facing resume affordance.` `packages/tools/src/course/list-drafts.ts:27` confirms `name: "course.list_drafts"`.

3. **Pointer preserved** — "See `packages/curriculum/src/modes/bootstrap.ts` for the canonical list" remains verbatim at the end of the tools sentence.

4. **Scope discipline** — no predates-v0.1.2 tools (list_units, list_lessons_in_unit, get_lesson_detail, list_dangling_refs, ask_student_question) were added; only the one v0.1.2 addition is documented.
