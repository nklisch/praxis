---
id: feature-refactor-course-create-service-decomposition-step-6-extract-pack-course-creation
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-course-create-service-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 6: Extract `createCourseFromPack` to `course-create/pack-course-creator.ts`

## Priority / Risk
Priority: Low — `createCourseFromPack` (lines 612–721) is entirely self-contained and
shares no state with the draft lifecycle. It is a different concern: direct course creation
from an already-imported canonical pack, no draft involved.
Risk: Low — no shared state, no event emission, straightforward extraction.

## Files affected
- **New**: `packages/core/src/services/course-create/pack-course-creator.ts`
- **Modified**: `packages/core/src/services/course-create-service.ts`

## Current state
`createCourseFromPack` (lines 612–721) in `CourseCreateServiceImpl`:
- Reads concept rows from the DB.
- Groups into lessons (LESSON_SIZE = 7).
- Runs a transaction: course row + lesson rows + skeleton gate rows.
- Returns `{ courseId, conceptCount }`.

It does not touch the draft store, does not emit events, and does not depend on any
other service method. It exists in `CourseCreateServiceImpl` because it is part of the
`CourseCreateService` interface and historically lived alongside the drafter methods.

## Target state
Extract a `createCourseFromPackTx` function (or a class `PackCourseCreator`) into
`packages/core/src/services/course-create/pack-course-creator.ts`.

```ts
export interface CreateCourseFromPackInput {
  studentId: StudentId;
  packId: string;
  conceptGraphId: ConceptGraphId;
  courseTitle: string;
  gradeLevel: string;
}

export async function createCourseFromPack(
  input: CreateCourseFromPackInput,
  db: PraxisDb,
): Promise<{ courseId: string; conceptCount: number }>
```

The service's `createCourseFromPack` method delegates entirely:
```ts
async createCourseFromPack(input) {
  return createCourseFromPackFn(input, this.deps.db);
}
```

## Implementation notes
- All schema imports (`courses`, `lessons`, `gates`, `concepts`) move into the new module.
  The service file can drop those imports if no other method uses them.
- `LESSON_SIZE = 7` constant moves into the new module as a module-level constant.
- `brandId` utility import needed in the new module.
- No `DraftStore` or listener access — the new module only needs `PraxisDb`.
- After extraction, the service can potentially drop its `@praxis/artifacts/schema`
  and `@praxis/curriculum/schema` imports entirely (only needed for `createCourseFromPack`
  and `persistDraftTx` which will have moved out).

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass.
- `course-create-service.ts` drops by ~110 lines.
- Public `CourseCreateService.createCourseFromPack` signature unchanged.
- All existing tests pass without modification.

## Risk + Rollback
Risk: Low — self-contained transaction, no shared state.
Rollback: inline back into the service.

## Implementation notes

Created `packages/core/src/services/course-create/pack-course-creator.ts` (113 lines).

Exported `createCourseFromPack(input: CreateCourseFromPackInput, db: PraxisDb)` as a
standalone async function, faithfully transplanting all logic from the service method
(lines 612–721). All schema imports (`courses`, `lessons`, `gates`, `concepts`),
`LESSON_SIZE = 7`, `uuidv7`, `brandId`, `eq`, and `PraxisDb` are self-contained in the
new module. No draft store, no listener, no engine access.

Per the deviation instruction, `course-create-service.ts` was NOT modified — Step 7
handles wiring the delegation.

Verification: `pnpm typecheck` clean (all packages); `pnpm --filter @praxis/core test`
— 96 test files, 1164 tests, all passed.
