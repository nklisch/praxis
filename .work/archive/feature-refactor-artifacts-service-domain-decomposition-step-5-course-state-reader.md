---
id: feature-refactor-artifacts-service-domain-decomposition-step-5-course-state-reader
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-artifacts-service-domain-decomposition
depends_on: []
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 5: Extract CourseStateReaderImpl

## What

Extract the `CourseStateReader` implementation (`read(input)`) from
`ArtifactsServiceImpl` into a dedicated
`CourseStateReaderImpl` class in
`packages/core/src/services/course-state-reader-impl.ts`.

`CourseStateReader` is a narrow read-only port used for prompt composition.
It is currently implemented by `ArtifactsServiceImpl` (the same instance is
passed as both `toolServices.artifacts` and `toolServices.courseState`).
After this step the facade implements `CourseStateReader` by delegating to
`CourseStateReaderImpl`.

## Methods to move

From `ArtifactsServiceImpl`:
- `read(input)` — line 852 (the `CourseStateReader` interface implementation)

The `read` method calls:
- `this.course(courseId)` → will call `CoursesServiceImpl.course()`
- `this.lessons(courseId)` → will call `LessonsServiceImpl.lessons()`
- `this.gateView(input)` → will call `GatesServiceImpl.gateView()`
- Direct DB reads for `concepts`, `conceptProgress`, `lessonProgress`

## Deps interface

`CourseStateReaderImpl` needs access to the three sub-services (or their DB
directly). Two options — pick the simpler one:

**Option A (preferred)**: inject sub-services directly:

```ts
export interface CourseStateReaderDeps {
  db: PraxisDb;
  log: Logger;
  courses: CoursesServiceImpl;   // for course() + lessons()
  lessons: LessonsServiceImpl;   // for lessons()
  gates: GatesServiceImpl;       // for gateView()
}
```

**Option B**: inject only `db` and `log`, replicate the direct DB queries
(avoids a service dep cycle, but duplicates query logic).

Option A is preferred because it keeps logic DRY and all deps flow in the
same direction.

## Construction constraint

`CourseStateReaderImpl` must be constructed AFTER steps 1–3 complete
(it deps on `CoursesServiceImpl`, `LessonsServiceImpl`, `GatesServiceImpl`).

In `buildArtifactsServices` the construction order becomes:
1. `CoursesServiceImpl`
2. `LessonsServiceImpl`
3. `GatesServiceImpl`
4. `CourseStateReaderImpl({ db, log, courses, lessons, gates })`
5. `ArtifactsServiceImpl` (facade) wrapping all four

## Wiring change in `buildArtifactsServices`

After this step, `services.ts` still exposes `artifacts: ArtifactsServiceImpl`.
The `toolServices.courseState` slot now receives the same facade instance
(which delegates `read()` to `CourseStateReaderImpl`). No changes to
`services.ts` field names.

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test` pass
- `ArtifactsService` interface unchanged
- `CourseStateReader` interface unchanged — `toolServices.courseState` still
  works for prompt composition

## Risk

Medium — `read()` is a complex query (concepts, conceptProgress,
lessonProgress, gateView). Must verify no behavioral regression via the
existing `artifacts-service.test.ts` tests that exercise `read()`.

## Implementation notes

Created `/home/nathan/dev/praxis/packages/core/src/services/course-state-reader-impl.ts` (127 lines).

- `CourseStateReaderImpl` implements the `CourseStateReader` port using Option A (inject sub-services directly): `{ db, log, courses: CoursesServiceImpl, lessons: LessonsServiceImpl, gates: GatesServiceImpl }`.
- The `read()` method is a direct extraction from `ArtifactsServiceImpl.read()` with three call sites substituted: `this.course()` → `this.deps.courses.course()`, `this.lessons()` → `this.deps.lessons.lessons()`, `this.gateView()` → `this.deps.gates.gateView()`. Direct DB reads for `concepts`, `conceptProgress`, and `lessonProgress` are retained in the method body (no sub-service owns these reads for the snapshot use case).
- All 96 core test files (1164 tests) pass. Typecheck on the new file is clean; pre-existing typecheck noise from Step 4's parallel `lessons-service.ts` changes is unrelated.
- Step 6 will wire this into `ArtifactsServiceImpl` (facade delegation).

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: `CourseStateReaderImpl` correctly implements Option A (sub-service injection):
`{ db, log, courses: CoursesServiceImpl, lessons: LessonsServiceImpl, gates: GatesServiceImpl }`.
The `read()` extraction is faithful — three service call sites substituted (`course()`,
`lessons()`, `gateView()`), direct DB reads for `concepts`, `conceptProgress`, and
`lessonProgress` correctly retained inline (no sub-service owns these for the snapshot
use case, and pushing them to a 4th sub-service would add unnecessary indirection).
The 146-line file is appropriately sized for the complexity. All acceptance criteria met.
