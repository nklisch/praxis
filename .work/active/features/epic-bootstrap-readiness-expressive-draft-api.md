---
id: epic-bootstrap-readiness-expressive-draft-api
kind: feature
stage: drafting
tags: [bootstrap, course-authoring]
parent: epic-bootstrap-readiness
depends_on: [epic-bootstrap-readiness-durable-drafts]
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Expressive draft-editing API

## Brief

`course.edit_draft` today is expressive enough to build a draft from
scratch (`add_concept`, `add_lesson`, etc.) but not expressive enough to
*refactor* one. Two real-session failure modes prove this:

1. **Silent no-ops and unrelinkable concepts.** `add_concept` is a silent
   no-op when the concept name already exists — no warning, no relink,
   the call appears to succeed. With no "link existing concept to a
   different lesson" op and no `add_edge` op exposed through `edit_draft`,
   removing a lesson orphans its concepts and there's no recovery path
   inside the tool. Mastery tracking for the orphaned concept silently
   breaks. (See `idea-course-edit-draft-api-gaps` for the merged-lesson
   transcript that surfaced this.)
2. **Non-cascading removes.** `remove_lesson` doesn't cascade-clean unit
   memberships or lesson assessments, so deleting a lesson leaves four
   units and five assessments pointing at the dead id and
   `course.confirm_draft`'s validation rejects the draft. The documented
   workaround — re-run `course.start_exploration` on the same draft —
   costs 30-90s per cleanup pass. (See
   `idea-bootstrap-draft-edit-and-query-apis`.)

This feature expands the `DraftEditOp` union and the `BootstrapServiceImpl`
edit handler to make non-trivial refactors actually tractable from the
agent's chat:

- **Idempotent / loud-failing `add_concept`** — repeat calls with an
  existing name either succeed-as-no-op with a clear `alreadyExisted:
  true` signal in the result, or fail loudly with a structured error the
  model can read. Pick during design.
- **`relink_concept` op** — change which lesson owns an existing concept
  without losing its prerequisite edges.
- **`add_edge` op inside `edit_draft`** — the underlying
  `course.draft_add_edges` tool already exists in the registry
  (`packages/tools/src/course/draft-add-edges.ts`) but isn't reachable
  through the in-flight edit path. Add the op so cascade-recoveries can
  rebuild edges after destructive cleanups.
- **Cascade-clean on `remove_lesson` / `remove_unit`** — when a lesson is
  removed, drop its memberships from units and remove its assessments in
  the same op. Removing a unit cascades to its lessons. Either the cascade
  is implicit (one op, multi-row update) or the op returns a structured
  preview the agent can confirm before applying — choose during design.
- **`validate_draft` op** — explicit pre-confirm pass that lists orphan
  concepts, dangling unit memberships, lesson assessments pointing at
  removed lessons, and any other invariant violations. Today the validator
  only runs at confirm time; surfacing it via `edit_draft` lets the agent
  self-correct before the human sees a rejection.
- **Chunked query / progressive disclosure** — `course.show_draft` today
  returns the entire graph, which gets unwieldy at 26 lessons / 8 units
  / 95 edges. Add narrower queries: `list_units`, `list_lessons_in_unit`,
  `get_lesson_detail`, `list_dangling_refs`. The agent can reason about
  parts without re-reading the whole graph every turn.

This feature does NOT change where drafts are persisted (that's
`epic-bootstrap-readiness-durable-drafts`, which must land first), does
NOT touch the explorer agent's tool registry (the explorer has its own
non-edit_draft tool set), and does NOT change the `course.confirm_draft`
materialisation path — same `persistDraft` semantics, just easier to
arrive at a clean draft before calling it.

## Epic context
- Parent epic: `epic-bootstrap-readiness`
- Position in epic: consumer of `durable-drafts`. The new ops mutate the
  same draft store; landing them on the persistent store directly avoids
  retrofitting Map→SQLite later.

## Foundation references
- `docs/ARCHITECTURE.md:331-335` — bootstrap-mode mechanics.
- `docs/CONTRACT.md:1258-1260` — current draft tool listing (will need a
  roll-forward as ops land).
- `packages/tools/src/course/edit-draft.ts` — `DraftEditOp` union schema;
  primary surface to extend.
- `packages/core/src/services/bootstrap-service.ts:492` — `editDraft`
  dispatcher.
- `packages/tools/src/course/draft-add-edges.ts` — existing add-edges
  tool, reachable today only outside `edit_draft`. Either fold or
  re-expose.

## Originating backlog
- `idea-course-edit-draft-api-gaps` — consumed by this feature; will be
  removed from `.work/backlog/` as part of epic-design.
- `idea-bootstrap-draft-edit-and-query-apis` — consumed by this feature;
  will be removed from `.work/backlog/` as part of epic-design.

<!-- Design pass (`/agile-workflow:feature-design`) will fill in:
       - The DraftEditOp union extensions (full Zod schemas per op)
       - Cascade semantics (implicit vs preview-and-confirm)
       - validate_draft return shape (structured invariant report)
       - Chunked-query response shapes
       - CONTRACT.md updates required
       - Test approach (per-op unit + end-to-end refactor scenario) -->
