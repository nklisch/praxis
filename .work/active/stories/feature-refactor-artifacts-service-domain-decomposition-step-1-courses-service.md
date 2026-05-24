---
id: feature-refactor-artifacts-service-domain-decomposition-step-1-courses-service
kind: story
stage: implementing
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
