---
id: epic-course-structured-tutor-draft-resumption-tool
kind: story
stage: implementing
tags: [tutor-ux, bootstrap, tools]
parent: epic-course-structured-tutor-draft-resumption
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# `course.list_drafts` tool + projection

## Scope

Add a new bootstrap-mode tool that lists the student's active course drafts in a
compact, model-friendly shape. The tool delegates to the existing
`BootstrapService.listActiveForStudent(studentId)` accessor and projects each
`DraftCourseState` to a `DraftListing` summary (id, title, subject, gradeLevel,
unit/lesson/concept/assessment counts, completionPercent, timestamps).

See the parent feature body for full type definitions, projection logic, and the
completionPercent heuristic.

## Files

- `packages/tools/src/course/list-drafts.ts` (new)
- `packages/tools/src/course/index.ts` (edit — export + include in `COURSE_TOOLS`)
- `packages/tools/src/course/__tests__/list-drafts.test.ts` (new)

## Acceptance Criteria

- [ ] `course.list_drafts` registered in `COURSE_TOOLS`.
- [ ] Input schema is `z.object({})` (no params; studentId from `ctx.studentId`).
- [ ] Returns `{ drafts: [] }` for a student with no active drafts.
- [ ] Projection: `title` falls back to `"Untitled draft"` when proposed.title is empty/whitespace.
- [ ] Projection: `assessmentCount = summativeCount + lessonAssessmentCount`.
- [ ] Output sorted by `lastTouchedAt` DESC.
- [ ] `completionPercent` is integer in `[0, 100]` and monotonic on field additions.
- [ ] Confirmed and discarded drafts excluded.
- [ ] Tool tier `"grounded"`, effects `["none"]`.
- [ ] Unit tests cover: empty, untitled, fully-scaffolded, sort order, completion-percent monotonicity.
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @praxis/tools` green.

## Implementation Notes

- Co-locate `toDraftListing()` as an exported pure function in the same file so
  tests can hit the projection without a `ToolContext` mock.
- Match the sibling `show-draft.ts` style (tier, effects, description shape).
- Do NOT add a `studentId` param to the input schema — `ctx.studentId` is the
  trust boundary.
