---
id: gate-docs-curriculum-bootstrap-tools-list-drafts
kind: story
stage: implementing
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
