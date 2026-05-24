---
id: feature-refactor-artifacts-service-domain-decomposition-step-4-assessments-service
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-artifacts-service-domain-decomposition
depends_on: []
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Extract AssessmentsService (lesson assessments domain)

## What

Extract lesson-assessment methods from `ArtifactsServiceImpl` into a new
`LessonAssessmentsServiceImpl` class in
`packages/core/src/services/lesson-assessments-service.ts`.

**Note on naming**: The brief calls this "AssessmentsService" but the project
already has `AssignmentServiceImpl` for the student-facing quiz/homework/exam
flow. To avoid collision, this service is named `LessonAssessmentsServiceImpl`
— it covers the authoring-time scheduling shells that attach assessments to
lessons (the `lessonAssessments` table), not the student runtime.

## Methods to move

From `ArtifactsServiceImpl` (public):
- `lessonAssessments(lessonId)` — line 139

This is a single read method. The domain is intentionally narrow now —
lesson assessment shell authoring writes (`createLessonAssessment`,
`deleteLessonAssessment`) may be added in future phases but do not yet
exist in `ArtifactsServiceImpl`.

## Deps interface

```ts
export interface LessonAssessmentsServiceDeps {
  db: PraxisDb;
  log: Logger;
}
```

## Target file

`packages/core/src/services/lesson-assessments-service.ts`

Export `LessonAssessmentsServiceImpl` from `packages/core/src/services/index.ts`.

## Implementation note

Given that this step extracts only a single method, it is intentionally
minimal. The extracted class establishes the boundary and provides a stable
home for the three future authoring methods listed in `docs/SPEC.md` for
Phase 16 (createLessonAssessment, listLessonAssessments, deleteLessonAssessment).

The facade delegation is a one-liner:
```ts
lessonAssessments(lessonId) { return this.lessonAssessments.lessonAssessments(lessonId); }
```

If the implementer judges that a dedicated class for one method is too much
overhead, `lessonAssessments` MAY instead move into `LessonsServiceImpl`
(it reads `lessonAssessmentsTable` — a lessons-adjacent table). Document the
decision in the commit message. Either placement is acceptable; do NOT leave
it in `CoursesServiceImpl`.

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test` pass
- `ArtifactsService` interface unchanged

## Risk

Low — single-method extraction with no transaction involvement.

## Implementation notes

**Duplication fix applied**: The step-2 agent (commit `cb5dc10`, lessons-service extraction)
accidentally included `lessonAssessments` in `LessonsServiceImpl`. This step removed it from
`lessons-service.ts` and placed it in the new `LessonAssessmentsServiceImpl` per the parent
feature's method assignment table.

Imports cleaned from `lessons-service.ts`: `lessonAssessmentsTable` (schema import),
`LessonAssessment`, and `LessonAssessmentId` type imports. `AssignmentId` was retained
because `units()` uses it for `summativeAssignmentId`.

New file: `packages/core/src/services/lesson-assessments-service.ts` (47 lines).
Exported from `packages/core/src/services/index.ts`.

Verification: `pnpm typecheck` passed (all packages clean), `pnpm --filter @praxis/core test`
passed (96 files, 1164 tests).
