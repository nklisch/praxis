---
id: idea-bootstrap-draft-edit-and-query-apis
created: 2026-05-10
tags: [bug, course-authoring]
---

A second bootstrap-API gap surfaced on top of `idea-course-edit-draft-api-gaps`:
`remove-lesson` in `course.edit_draft` doesn't cascade-clean its dependents —
after deleting lessons, four units still claim the dead lesson IDs as members
and five lesson assessments still target them, so `course.confirm_draft`'s
validation rejects the draft. The `edit_draft` API exposes no ops to repair
unit memberships or remove orphaned assessments directly, so the documented
recovery path is "re-run `course.start_exploration` on the same draft and let
the explorer's persistence layer rebuild the linkages." That's a sledgehammer
for what should be a targeted edit, and it means every non-trivial cleanup
costs a 30–90s explorer round-trip. Broader theme: the tutor needs an
authoring API that lets it (a) edit and fix a draft freely — cascade-correct
removals, repair memberships, relink assessments, prune orphans — without
discarding work, and (b) query the draft in chunks with progressive
disclosure (today `course.show_draft` returns the whole graph, which gets
unwieldy for a 26-lesson / 8-unit / 95-edge draft; the agent needs `list
units`, `list lessons in unit`, `get lesson detail`, `list dangling refs`
shapes so it can reason about parts without re-reading the whole thing every
turn). Schema lives at `packages/tools/src/course/edit-draft.ts`; the draft
state and its validators live in `BootstrapServiceImpl` under
`packages/core/src/services/`. Likely overlaps with
`idea-course-edit-draft-api-gaps` — scope them together.
