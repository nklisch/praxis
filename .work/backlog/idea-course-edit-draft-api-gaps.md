---
id: idea-course-edit-draft-api-gaps
created: 2026-05-10
tags: [bug, course-authoring]
---

The `course.edit_draft` op set isn't expressive enough to safely refactor a
draft after exploration, and it fails silently in the worst possible way. A
real session merging 30 lessons → 26 in 8 units left 4 concepts orphaned
(Absolute Value Equations, Systems Applications, Completing the Square,
Solving Rational Equations) while 11 prerequisite edges still depend on them,
because: (1) `add-concept` is a silent no-op when the concept name already
exists — no warning, no relink, the call appears to succeed; (2) there's no
"link existing concept to a different lesson" op, so when the original
lesson is removed the concept can't be re-parented; (3) there's no `add-edge`
op in `edit_draft` (a `draft_add_edges` tool exists in the broader registry
at `packages/tools/src/course/draft-add-edges.ts` but isn't reachable through
the in-flight edit path), so `remove-concept` is destructive — it would drop
the 11 edges with no way to recreate them. Practical effect: lesson merges
look successful, mastery tracking is quietly broken for the orphaned
concepts. Fix shape probably needs: idempotent / loud-failing `add_concept`,
a `relink_concept` op, an in-`edit_draft` `add_edge` op (or expose the
existing tool to bootstrap mode), and a `validate_draft` pass that flags
orphaned concepts and dangling edges before `course.confirm_draft` persists
them. The schema lives in `packages/tools/src/course/edit-draft.ts` and the
draft-state object that gets mutated is in `BootstrapServiceImpl` at
`packages/core/src/services/`.
