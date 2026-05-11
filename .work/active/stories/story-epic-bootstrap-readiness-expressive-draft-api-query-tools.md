---
id: story-epic-bootstrap-readiness-expressive-draft-api-query-tools
kind: story
stage: implementing
tags: [bootstrap, course-authoring, tools]
parent: epic-bootstrap-readiness-expressive-draft-api
depends_on: [story-epic-bootstrap-readiness-expressive-draft-api-edit-ops]
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Chunked-query tools for the draft (list_units, list_lessons_in_unit, get_lesson_detail, list_dangling_refs)

## Scope

Add four new top-level read tools so the tutor can inspect a draft in
parts without loading the whole graph every turn. `course.show_draft`
stays for the whole-draft view; the new tools are scoped projections.

## Units implemented

- **Unit 2** — Four new read tools + their service-method backings +
  mode/prompt wiring. See the full design in
  `epic-bootstrap-readiness-expressive-draft-api.md`.

## Files touched

**New tool files**:
- `packages/tools/src/course/list-units.ts`
- `packages/tools/src/course/list-lessons-in-unit.ts`
- `packages/tools/src/course/get-lesson-detail.ts`
- `packages/tools/src/course/list-dangling-refs.ts`

**Modified**:
- `packages/tools/src/course/index.ts` — re-export the four new tools.
- `packages/tools/src/index.ts` — register in the default tools array
  (alongside existing course tools).
- `packages/curriculum/src/modes/bootstrap.ts` — add the four tool names
  to `bootstrapMode.toolNames`.
- `packages/curriculum/src/modes/configure.ts` — same for `configureMode`.
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` — append
  one-line descriptions of each new tool.
- `packages/curriculum/src/modes/fragments/configure-tools.ts` — same.
- `packages/core/src/services/bootstrap-service.ts` — add public methods:
  - `async listUnits(draftId): Promise<UnitListEntry[] | null>`
  - `async listLessonsInUnit({draftId, draftUnitId}): Promise<LessonsInUnit | null>`
  - `async getLessonDetail({draftId, draftLessonId}): Promise<LessonDetail | null>`
  - `async listDanglingRefs(draftId): Promise<DanglingRefsReport | null>`
- `packages/core/src/types/tool.ts` (or wherever `BootstrapService`
  interface lives) — add the four method signatures to the interface.

**Tests**:
- `packages/core/src/__tests__/bootstrap-service.queries.test.ts` (new)
  — per-method happy-path + draft-not-found + dangling-refs scenarios.
- `packages/tools/src/course/__tests__/list-units.test.ts`,
  `list-lessons-in-unit.test.ts`, `get-lesson-detail.test.ts`,
  `list-dangling-refs.test.ts` (new) — schema validation + handler
  dispatch tests.

## Acceptance

- [ ] All four tools exist with schemas matching the design's shapes
      (units list with `lessonCount` + `hasSummative`; lessons-in-unit
      with `conceptCount` + `assessmentCount`; lesson detail with full
      concept + assessment listings + parent unit; dangling-refs with
      orphan concepts, dangling unit memberships, dangling assessments,
      and edges referencing unknown concepts).
- [ ] Each tool reachable via `registry.dispatch(...)`.
- [ ] Each tool in `bootstrapMode.toolNames` and `configureMode.toolNames`.
- [ ] Prompt fragments document each tool one-line.
- [ ] Service methods return `null` for unknown draftId (consistent
      with `showDraft`).
- [ ] `listDanglingRefs` correctly identifies:
      - orphan concepts (in graph, not referenced by any lesson)
      - dangling unit memberships (`draftUnitId.draftLessonIds`
        containing ids not in `proposedLessons`)
      - dangling lesson assessments (`draftLessonId` not in
        `proposedLessons`)
      - edges with unknown `fromName` or `toName`
- [ ] Tests cover happy path, draft-not-found, AND the dangling-refs
      scenarios (orphan concept, dangling membership, dangling
      assessment, dangling edge — at least one of each).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope (sibling story handles)

- All edit-op extensions (relink-concept, add-edge, remove-unit,
  validate-draft, cascade-removes, applyEdit return-shape change).
- The `course.edit_draft` tool output `warnings` field.

## Parent context

- Parent feature: `epic-bootstrap-readiness-expressive-draft-api`
- Parent epic: `epic-bootstrap-readiness`
- Depends on
  `story-epic-bootstrap-readiness-expressive-draft-api-edit-ops` —
  sibling story modifies `bootstrap-service.ts` extensively;
  serializing avoids merge conflicts.
