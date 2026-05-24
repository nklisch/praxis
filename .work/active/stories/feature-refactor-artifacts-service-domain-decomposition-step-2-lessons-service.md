---
id: feature-refactor-artifacts-service-domain-decomposition-step-2-lessons-service
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-artifacts-service-domain-decomposition
depends_on: []
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Extract LessonsService

## What

Extract all lesson-domain methods from `ArtifactsServiceImpl` into a new
`LessonsServiceImpl` class in
`packages/core/src/services/lessons-service.ts`.

## Methods to move

From `ArtifactsServiceImpl` (public):
- `lessons(courseId)` — line 92
- `units(courseId)` — line 102 (reads `courseUnits` + `lessonUnits` + `lessons`;
  logically a lessons/units query)
- `lessonAssessments(lessonId)` — line 139
- `createLesson(input)` — line 510
- `updateLesson(input)` — line 546
- `deleteLesson(input)` — line 587 (cross-domain transaction: deletes
  `lessonProgress` and cascade-deletes gates by JSON scan — see
  cross-domain note; the method is Lessons-owned but the transaction
  must touch the gates table; implement as a single DB transaction inside
  `LessonsServiceImpl` that directly queries `gatesTable` for the JSON
  guard scan, matching the existing implementation)
- `getLesson(lessonId)` — line 770
- `upsertLesson(lesson)` — line 785

Private helpers that move with this service:
- `nextLessonOrderIndex(courseId)` — line 955

Row-to-domain helpers that move:
- `rowToLesson(row)` — line 1038

## Deps interface

```ts
export interface LessonsServiceDeps {
  db: PraxisDb;
  log: Logger;
}
```

`deleteLesson` touches the gates table directly inside a transaction (JSON
column scan — no FK exists). This is the only cross-table write in
`LessonsServiceImpl`; it is acceptable because it happens inside one
atomic DB transaction and does not call `GatesServiceImpl` (no circular dep).

## Target file

`packages/core/src/services/lessons-service.ts`

Export `LessonsServiceImpl` from `packages/core/src/services/index.ts`.

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test` pass
- `ArtifactsService` interface unchanged
- `LessonsServiceImpl` can be constructed independently with `{ db, log }`

## Risk

Low — pure extraction. `deleteLesson` cross-table write is unchanged (same
single transaction).
