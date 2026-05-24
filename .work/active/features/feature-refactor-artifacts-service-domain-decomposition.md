---
id: feature-refactor-artifacts-service-domain-decomposition
kind: feature
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-24
---

# Decompose `ArtifactsService` into per-domain services

## Brief
`packages/core/src/services/artifacts-service.ts` is 1062 lines with 37 public/async
methods spanning five distinct artifact domains: **courses, lessons, gates, flashcards,
assessments**. It's effectively five services bundled into one class with shared DB access.

The size and breadth make it:
- Hard to navigate (37-method surface in one file)
- Hard to swap or stub in tests (one giant fake covers everything)
- Risky to change (no domain boundary signal)
- Hard to onboard (no answer to "where do flashcards live?")

## Refactor target
Decompose into per-domain services that compose into a facade preserving the existing
`ArtifactsService` interface for backward compatibility:
- `CoursesService` — course CRUD, listing, queries
- `LessonsService` — lesson CRUD, ordering, queries
- `GatesService` — gate CRUD, evaluation, graph operations
- `FlashcardsService` — flashcard CRUD, due-card queries, SRS state
- `AssessmentsService` — assessment shells, item authoring, grading shells

The existing `ArtifactsService` becomes a thin facade that holds and delegates to the
five sub-services. This keeps the IPC channel layer and existing consumers unchanged
while allowing internal callers to depend on narrower interfaces.

## Constraints
- The IPC channel surface (`packages/desktop/electron/main/artifacts-channel.ts`) and
  client SDK shape must stay identical — no UI changes required.
- The Phase 3 dependency-direction rule still applies: only `services/` may import
  `@praxis/engines` / `@praxis/tools` at runtime.
- DB transactions that currently span multiple domains (e.g., creating a course with
  initial lessons) must keep their atomicity — the facade may need to coordinate
  multi-service transactions.

## Discovery evidence
- File length: 1062 lines (verified)
- Method count: 37 public/async
- Domain count: 5 (courses, lessons, gates, flashcards, assessments)

## Refactor Overview

`ArtifactsServiceImpl` (1062 lines, ~37 public/async methods) is decomposed
into 5 focused sub-services plus a thin facade. The facade class retains the
`ArtifactsService` and `CourseStateReader` interface shapes byte-for-byte, so
no IPC channel code, client SDK, or tool handler changes are required.

### Method-to-service assignment

| Sub-service | Methods |
|---|---|
| `CoursesServiceImpl` | `course`, `courses`, `progress`, `listDocuments`, `updateCourse`, `getCourseSummary`†, `concepts`, `markLessonStarted`, `markConceptStudied` + privates `summarizeCourse`, `findLessonContainingConcept` |
| `LessonsServiceImpl` | `lessons`, `units`, `createLesson`, `updateLesson`, `deleteLesson`‡, `getLesson`, `upsertLesson` + private `nextLessonOrderIndex` |
| `GatesServiceImpl` | `gates`, `gateView`, `evaluateAndPersistGates`, `markGatesViewed`, `newlyUnlockedCount`, `createGate`, `updateGate`, `deleteGate`, `overrideGate`, `getGate`, `upsertGate` |
| `LessonAssessmentsServiceImpl` | `lessonAssessments` |
| `CourseStateReaderImpl` | `read` (the `CourseStateReader` port) |
| `ArtifactsServiceImpl` (facade) | delegates every public method; owns `getCourseSummary`† aggregation |

† `getCourseSummary` is a pure-read cross-domain aggregation — it lives in the
facade, calling `CoursesServiceImpl.course()`, `LessonsServiceImpl.lessons()`,
`GatesServiceImpl.gates()`, and `CoursesServiceImpl.concepts()` in parallel.

‡ `deleteLesson` is logically lesson-owned but touches the gates table inside
a single DB transaction (JSON guard scan — no FK). This is correct; the
transaction is self-contained inside `LessonsServiceImpl`.

### Deps shape changes

`ArtifactsServiceDeps` changes from `{ db, log, masteryReader, gradeReader }`
to `{ courses, lessons, gates, lessonAssessments, courseStateReader }`. The
reader deps (`masteryReader`, `gradeReader`) move into `GatesServiceDeps`.

The only consumer of `ArtifactsServiceDeps` at construction time is
`packages/desktop/electron/main/services/build-artifacts-services.ts` —
updated in step 6.

## Refactor Steps

1. **Step 1 — CoursesService** (low risk, no deps)
   File: `packages/core/src/services/courses-service.ts`
   Deps: `{ db, log }`

2. **Step 2 — LessonsService** (low risk, no deps)
   File: `packages/core/src/services/lessons-service.ts`
   Deps: `{ db, log }`

3. **Step 3 — GatesService** (low risk, no deps)
   File: `packages/core/src/services/gates-service.ts`
   Deps: `{ db, log, masteryReader, gradeReader }`

4. **Step 4 — LessonAssessmentsService** (low risk, no deps; single method)
   File: `packages/core/src/services/lesson-assessments-service.ts`
   Deps: `{ db, log }`

5. **Step 5 — CourseStateReaderImpl** (medium risk; depends on steps 1–3)
   File: `packages/core/src/services/course-state-reader-impl.ts`
   Deps: `{ db, log, courses: CoursesServiceImpl, lessons: LessonsServiceImpl, gates: GatesServiceImpl }`

6. **Step 6 — Facade composition** (medium risk; depends on all 5 steps)
   Rewrites `ArtifactsServiceImpl` as a thin delegating facade; updates
   `buildArtifactsServices`; updates test setups that construct `ArtifactsServiceImpl`.

## Implementation Order

Steps 1–4 are fully independent and can run in parallel (Wave 1).
Step 5 depends on steps 1–3 (may run after Wave 1 or alongside step 4).
Step 6 depends on all five steps (Wave 2).

```
Wave 1 (parallel): Step 1, Step 2, Step 3, Step 4
Wave 1b (after 1–3): Step 5
Wave 2: Step 6
```

## Cross-domain transaction notes

Two operations span multiple domain tables:

1. **`deleteLesson`** — deletes `lessonProgress`, then scans `gatesTable` for
   JSON-matched gate rows and deletes them, then deletes the `lessons` row —
   all in one `db.transaction()`. This stays inside `LessonsServiceImpl` as a
   direct multi-table transaction (not a service-to-service call). Correct
   because the gates table scan is a cleanup side-effect, not a "gates domain"
   operation.

2. **`getCourseSummary`** — pure-read aggregation across courses, lessons,
   gates, and concepts. Needs no transaction (reads only). Owned by the facade;
   calls sub-services in `Promise.all([...])`.

No other cross-domain transactions exist. All other writes are single-table or
self-contained within one domain's service.
