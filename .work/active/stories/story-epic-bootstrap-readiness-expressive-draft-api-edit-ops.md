---
id: story-epic-bootstrap-readiness-expressive-draft-api-edit-ops
kind: story
stage: implementing
tags: [bootstrap, course-authoring, tools]
parent: epic-bootstrap-readiness-expressive-draft-api
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Extend `DraftEditOp` with relink/add-edge/cascade-removes/validate + warning-shape

## Scope

Add the missing edit operations and cascade semantics that real bootstrap
sessions need. Changes `applyEdit` to return `{ state, warnings[] }` so
the model sees signals like "concept already exists" or "removed lesson
also cascaded N memberships." Surfaces the warnings through
`course.edit_draft` output.

## Units implemented

- **Unit 1** — DraftEditOp extensions + applyEdit return-shape change +
  tool output `warnings` field. See the full design in
  `epic-bootstrap-readiness-expressive-draft-api.md`.

## Files touched

- `packages/tools/src/course/edit-draft.ts` — Zod discriminator gets new
  variants (`relink-concept`, `add-edge`, `remove-unit`, `validate-draft`);
  output schema gains optional `warnings` field; description text
  updated to mention warnings.
- `packages/core/src/types/` — `DraftEditOp` TypeScript union gets the
  matching variants. Find the file with `grep -rn "type DraftEditOp\|DraftEditOp =" packages/core/src/types/`.
- `packages/core/src/services/bootstrap-service.ts`:
  - `applyEdit` signature change: returns `{ state, warnings }` instead
    of bare `ProposedCourse`. Every case clause returns the new shape.
  - `add-concept` case: existing-name path returns the same state +
    one warning (no silent merge).
  - `remove-lesson` case: cascade-cleans `proposedUnits[*].draftLessonIds`
    and `proposedLessonAssessments` whose `draftLessonId` matches the
    removed lesson; warns with counts.
  - New `relink-concept` case: moves a concept's lesson membership;
    `lessonIndex: -1` orphans it; concept node and edges unchanged.
  - New `add-edge` case: mirrors `BootstrapService.addEdge` validation
    (both endpoints exist, no self-edges, no duplicates); throws on
    failure.
  - New `remove-unit` case: drops the unit (and its summative); warns
    with lesson-count.
  - New `validate-draft` case: calls `validateProposed`, returns state
    unchanged + issue summaries as warnings.
  - `editDraft` public method: returns the same `DraftCourseState`
    shape (no break) but threads warnings up to the caller.
- `packages/core/src/__tests__/bootstrap-service.test.ts` — extend with
  new ops + cascade scenarios. May want a separate file
  (`bootstrap-service.edit-ops.test.ts`) if the existing file grows too
  long.

## Acceptance

- [ ] `DraftEditOp` Zod discriminator includes `relink-concept`,
      `add-edge`, `remove-unit`, `validate-draft`.
- [ ] `applyEdit` returns `{ state, warnings[] }`.
- [ ] `add-concept` on existing name returns state unchanged + warning
      `"concept '<name>' already exists in the draft; no new concept
      was added. Use relink-concept if you want to associate it with
      lesson <i>."` (or equivalent unambiguous text the test pins).
- [ ] `remove-lesson` cascade: pre-seed a draft with a lesson in 2
      units and with 3 lesson-assessments; remove the lesson; verify
      both units' `draftLessonIds` no longer contain the id AND the
      three assessments are gone AND a warning enumerates the counts.
- [ ] `remove-unit` removes the unit; warns with lesson count.
- [ ] `validate-draft` returns state unchanged; warnings enumerate all
      issues that `validateProposed` finds (or empty if clean).
- [ ] `relink-concept` with `lessonIndex >= 0` moves the concept name
      from any current lessons to the target lesson at
      `afterConceptIndex+1` (or end if undefined); concept node + edges
      untouched.
- [ ] `relink-concept` with `lessonIndex: -1` removes the concept name
      from every lesson without dropping the node or edges.
- [ ] `add-edge` throws on missing endpoint, self-edge, or duplicate.
      Happy path returns the new state + empty warnings.
- [ ] `course.edit_draft` tool output schema includes optional
      `warnings: string[]`. Tool returns warnings to the model.
- [ ] No existing edit op's behavior regresses.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope (sibling story handles)

- New `course.list_units`, `course.list_lessons_in_unit`,
  `course.get_lesson_detail`, `course.list_dangling_refs` tools and
  their service methods.

## Parent context

- Parent feature: `epic-bootstrap-readiness-expressive-draft-api`
- Parent epic: `epic-bootstrap-readiness`
- Sibling story
  `story-epic-bootstrap-readiness-expressive-draft-api-query-tools`
  depends on this one (lands after, avoids merge conflicts on
  `bootstrap-service.ts`).
