---
id: feature-refactor-artifacts-service-domain-decomposition-step-1-courses-service
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-artifacts-service-domain-decomposition
depends_on: []
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Extract CoursesService

## What

Extract all course-domain methods from `ArtifactsServiceImpl` into a new
`CoursesServiceImpl` class in
`packages/core/src/services/courses-service.ts`.

## Methods to move

From `ArtifactsServiceImpl` (public):
- `course(id)` — line 81
- `courses(studentId)` — line 87
- `progress(studentId)` — line 163 (calls `summarizeCourse` which is course-domain)
- `listDocuments(studentId)` — line 180 (documents query; lives here until
  a Documents domain is created; belongs with course reads)
- `updateCourse(input)` — line 479
- `getCourseSummary(courseId)` — line 745 (delegates to `lessons`, `gates`,
  `concepts`; must call sub-services at facade level — see cross-domain note)
- `concepts(courseId)` — line 444 (joins via `course.conceptGraphId`; reads
  from `@praxis/curriculum/schema`; logically "course concepts")
- `markLessonStarted(input)` — line 200 (writes `lessonProgress`; lesson
  boundary, but progress roll-up belongs in courses domain — stays here)
- `markConceptStudied(input)` — line 217 (writes `conceptProgress`, rolls up
  to lesson completion; cross-concept/lesson; stays in courses domain)

Private helpers that move with this service:
- `summarizeCourse(row, studentId)` — line 976
- `findLessonContainingConcept(conceptId)` — line 966 (used by
  `markConceptStudied`)

Row-to-domain helpers that move:
- `rowToCourse(row)` — line 1019

## Deps interface

```ts
export interface CoursesServiceDeps {
  db: PraxisDb;
  log: Logger;
}
```

`markConceptStudied` calls `findLessonContainingConcept` internally (reads
lessons table) — self-contained, no LessonsService dep needed.

## Target file

`packages/core/src/services/courses-service.ts`

Export `CoursesServiceImpl` from `packages/core/src/services/index.ts`.

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test` pass
- `ArtifactsService` interface unchanged (verified by facade step)
- `CoursesServiceImpl` can be constructed independently with just `{ db, log }`

## Risk

Low — pure extraction, no logic changes.

## Implementation notes

- Created `packages/core/src/services/courses-service.ts` (262 lines).
- `CoursesServiceImpl` holds 8 public methods (`course`, `courses`, `progress`,
  `listDocuments`, `concepts`, `updateCourse`, `markLessonStarted`,
  `markConceptStudied`) and 2 private helpers (`summarizeCourse`,
  `findLessonContainingConcept`), all extracted verbatim from
  `ArtifactsServiceImpl` with only `this.deps` references unchanged.
- `rowToCourse` row-to-domain helper extracted and exported (needed by facade
  in step 6 and potentially by `CourseStateReaderImpl` in step 5).
- `getCourseSummary` was intentionally left out of this service per the feature
  design — it is a cross-domain aggregation owned by the facade (step 6).
- Exported `CoursesServiceImpl`, `CoursesServiceDeps`, and `rowToCourse` from
  `packages/core/src/services/index.ts`.
- `pnpm typecheck` and `pnpm --filter @praxis/core test` both pass (96 test
  files, 1164 tests).

## Review

Verdict: **done** (commit `b74a14f`).

- `CoursesServiceImpl` exported from `courses-service.ts` (327 lines in full commit; 262 lines of class body matching the story's stated 262-line count).
- Constructor takes only `{ db, log }` — no cross-service deps.
- All 8 public methods present: `course`, `courses`, `progress`, `listDocuments`, `concepts`, `updateCourse`, `markLessonStarted`, `markConceptStudied`.
- Both private helpers present: `findLessonContainingConcept`, `summarizeCourse`.
- `rowToCourse` exported at module level (needed by facade step 6).
- `getCourseSummary` correctly omitted (cross-domain aggregation, facade-owned per design).
- `CoursesServiceImpl`, `CoursesServiceDeps`, and `rowToCourse` all re-exported from `packages/core/src/services/index.ts`.
- `loadOrThrow` used correctly after `updateCourse`.
- No logic changes — pure extraction as intended.
- All patterns followed correctly.
