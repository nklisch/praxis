---
id: feature-refactor-artifacts-service-domain-decomposition-step-6-facade-composition
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-artifacts-service-domain-decomposition
depends_on:
  - feature-refactor-artifacts-service-domain-decomposition-step-1-courses-service
  - feature-refactor-artifacts-service-domain-decomposition-step-2-lessons-service
  - feature-refactor-artifacts-service-domain-decomposition-step-3-gates-service
  - feature-refactor-artifacts-service-domain-decomposition-step-4-assessments-service
  - feature-refactor-artifacts-service-domain-decomposition-step-5-course-state-reader
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 6: Thin-facade composition (ArtifactsServiceImpl becomes a delegating facade)

## What

Rewrite `ArtifactsServiceImpl` in
`packages/core/src/services/artifacts-service.ts` as a thin facade that holds
the five sub-services and delegates every public method. The class continues to
implement both `ArtifactsService` and `CourseStateReader`. No caller changes.

## New class shape

```ts
export interface ArtifactsServiceDeps {
  courses: CoursesServiceImpl;
  lessons: LessonsServiceImpl;
  gates: GatesServiceImpl;
  lessonAssessments: LessonAssessmentsServiceImpl;
  courseStateReader: CourseStateReaderImpl;
}

export class ArtifactsServiceImpl implements ArtifactsService, CourseStateReader {
  constructor(private readonly deps: ArtifactsServiceDeps) {}

  // ArtifactsService — each method is a one-liner delegation
  course(id)           { return this.deps.courses.course(id); }
  courses(studentId)   { return this.deps.courses.courses(studentId); }
  lessons(courseId)    { return this.deps.lessons.lessons(courseId); }
  units(courseId)      { return this.deps.lessons.units(courseId); }
  lessonAssessments(l) { return this.deps.lessonAssessments.lessonAssessments(l); }
  gates(courseId)      { return this.deps.gates.gates(courseId); }
  progress(studentId)  { return this.deps.courses.progress(studentId); }
  listDocuments(s)     { return this.deps.courses.listDocuments(s); }
  markLessonStarted(i) { return this.deps.courses.markLessonStarted(i); }
  markConceptStudied(i){ return this.deps.courses.markConceptStudied(i); }
  gateView(i)          { return this.deps.gates.gateView(i); }
  evaluateAndPersistGates(i){ return this.deps.gates.evaluateAndPersistGates(i); }
  markGatesViewed(i)   { return this.deps.gates.markGatesViewed(i); }
  newlyUnlockedCount(i){ return this.deps.gates.newlyUnlockedCount(i); }
  concepts(courseId)   { return this.deps.courses.concepts(courseId); }
  updateCourse(i)      { return this.deps.courses.updateCourse(i); }
  createLesson(i)      { return this.deps.lessons.createLesson(i); }
  updateLesson(i)      { return this.deps.lessons.updateLesson(i); }
  deleteLesson(i)      { return this.deps.lessons.deleteLesson(i); }
  createGate(i)        { return this.deps.gates.createGate(i); }
  updateGate(i)        { return this.deps.gates.updateGate(i); }
  deleteGate(i)        { return this.deps.gates.deleteGate(i); }
  overrideGate(i)      { return this.deps.gates.overrideGate(i); }
  getCourseSummary(id) { ... }  // see cross-domain note below
  getLesson(id)        { return this.deps.lessons.getLesson(id); }
  getGate(id)          { return this.deps.gates.getGate(id); }
  upsertLesson(l)      { return this.deps.lessons.upsertLesson(l); }
  upsertGate(g)        { return this.deps.gates.upsertGate(g); }

  // CourseStateReader
  read(i) { return this.deps.courseStateReader.read(i); }
}
```

## Cross-domain method: getCourseSummary

`getCourseSummary(courseId)` aggregates course + lessons + gates + concepts.
Currently it calls `this.course()`, `this.lessons()`, `this.gates()`, and
`this.concepts()` — all self-calls. In the facade this becomes:

```ts
async getCourseSummary(courseId) {
  const course = await this.deps.courses.course(courseId);
  if (!course) throw new Error(`Course not found: ${courseId}`);
  const [lessonsList, gatesList, conceptsList] = await Promise.all([
    this.deps.lessons.lessons(courseId),
    this.deps.gates.gates(courseId),
    this.deps.courses.concepts(courseId),
  ]);
  return { course, lessons: lessonsList, gates: gatesList, concepts: conceptsList };
}
```

No transaction needed — this is a pure read aggregation.

## buildArtifactsServices changes

`buildArtifactsServices` in
`packages/desktop/electron/main/services/build-artifacts-services.ts`
must be updated to construct the sub-services first, then wire the facade:

```ts
const coursesService = new CoursesServiceImpl({ db, log });
const lessonsService = new LessonsServiceImpl({ db, log });
const gatesService = new GatesServiceImpl({ db, log, masteryReader: memoryService, gradeReader: assignmentService });
const lessonAssessmentsService = new LessonAssessmentsServiceImpl({ db, log });
const courseStateReader = new CourseStateReaderImpl({ db, log, courses: coursesService, lessons: lessonsService, gates: gatesService });

const artifactsService = new ArtifactsServiceImpl({
  courses: coursesService,
  lessons: lessonsService,
  gates: gatesService,
  lessonAssessments: lessonAssessmentsService,
  courseStateReader,
});
```

`services.ts` `artifacts: ArtifactsServiceImpl` type annotation stays.
`toolServices.courseState` in `buildServices` still receives `artifacts.artifactsService`
(which now delegates `read()` to `CourseStateReaderImpl`). No change to callers.

## ArtifactsServiceDeps interface change

The exported `ArtifactsServiceDeps` interface changes from `{ db, log, masteryReader, gradeReader }`
to `{ courses, lessons, gates, lessonAssessments, courseStateReader }`.
This type is exported from `packages/core/src/services/index.ts` and re-exported
via `packages/core/src/services/artifacts-service.ts`. The only consumer of
`ArtifactsServiceDeps` is `build-artifacts-services.ts` in `@praxis/desktop` — it
must be updated in this step.

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test` all pass
- `ArtifactsService` and `CourseStateReader` interfaces byte-identical (no
  change to `packages/core/src/types/artifacts.ts`)
- `buildArtifactsServices` compiles without errors
- IPC channel `artifacts-channel.ts` unchanged
- All existing `artifacts-service*.test.ts` tests pass (they construct
  `ArtifactsServiceImpl` — update their setup to use the new `deps` shape)

## Risk

Medium — this is the integration step. The individual extractions (steps 1–5)
will have proven the logic; this step's risk is primarily wiring errors.
Run `pnpm test --reporter=verbose` and fix any test setup code that
constructs `ArtifactsServiceImpl` directly.

## Implementation notes

- Line count: 1062 → 222 (79% reduction)
- Facade method count: 28 delegating methods + 1 cross-domain aggregator (`getCourseSummary`)
- `getCourseSummary` kept at facade: fans out to `courses.course()`, `lessons.lessons()`, `gates.gates()`, `courses.concepts()` in parallel — kept because it spans 4 sub-services and would require circular deps to delegate
- `CourseStateReaderImpl` added to `services/index.ts` exports (was missing)
- Build wiring updated: `buildArtifactsServices` constructs 5 sub-services then wires the facade
- Test wiring updated in 4 unit test files (`artifacts-service.test.ts`, `artifacts-service-writes.test.ts`, `artifacts-service-concepts.test.ts`, `artifacts-service-gates.test.ts`, `snapshot-restore.test.ts`) and 5 integration test files (`gates-end-to-end.test.ts`, `adaptive-routing-end-to-end.test.ts`, `configure-end-to-end.test.ts`, `mastery-end-to-end.test.ts`, `pack-import-end-to-end.test.ts`) plus `scripts/db-gates.ts`
- All 4796 tests pass (4773 active + 23 skipped)
