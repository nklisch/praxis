---
id: feature-refactor-course-create-service-decomposition-step-4-extract-chunked-queries
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-course-create-service-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Extract chunked read/query methods to `course-create/draft-queries.ts`

## Priority / Risk
Priority: Medium — pure projection logic; natural boundary already implied by the
"Chunked-query methods" comment at line 723.
Risk: Low — pure read functions, no mutation, no side effects.

## Files affected
- **New**: `packages/core/src/services/course-create/draft-queries.ts`
- **Modified**: `packages/core/src/services/course-create-service.ts`

## Current state
Four read methods live in `CourseCreateServiceImpl` (lines 725–857):
- `listUnits` (725–736) — maps `proposedUnits` to `UnitListEntry[]`
- `listLessonsInUnit` (738–776) — joins units + lessons + per-lesson assessment counts
- `getLessonDetail` (778–811) — finds a lesson, its assessments, and its parent unit
- `listDanglingRefs` (813–857) — computes orphan concepts, dangling unit memberships,
  dangling assessments, and edges referencing unknown concepts

Each follows: `store.load → null-check → pure projection from `d.proposed``.

## Target state
Extract these four as pure projection functions into
`packages/core/src/services/course-create/draft-queries.ts`.
Each accepts `(proposed: ProposedCourse): T` (no draft lifecycle, no store access).

The service methods become thin wrappers:
```ts
async listUnits(draftId: string) {
  const d = this.store.load(brandId<"DraftId">(draftId) as DraftId);
  if (!d) return null;
  return listUnitsQuery(d.proposed);
}
```

## Implementation notes
- Return types (`UnitListEntry`, `LessonsInUnit`, `LessonDetail`, `DanglingRefsReport`) are
  imported from `../../types/index.js` (relative from the new module file).
- No `normalizeConceptName` needed in this module (edge references use name equality, not normalized).
- No external imports beyond `@praxis/core/types`.
- `listDanglingRefs` currently uses bare string set comparisons — this is correct for
  dangling-ref detection since it's about structural integrity, not normalized membership.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass.
- `course-create-service.ts` drops by ~130 lines (the 4 query method bodies).
- Public method signatures on `CourseCreateService` unchanged.
- All existing tests pass without modification.

## Risk + Rollback
Risk: Low — pure read functions.
Rollback: inline the functions back; tests catch regressions.

## Implementation notes
Created `packages/core/src/services/course-create/draft-queries.ts` (149 lines) with four pure projection functions:
- `listUnitsQuery(proposed: ProposedCourse): UnitListEntry[]`
- `listLessonsInUnitQuery(proposed: ProposedCourse, draftUnitId: string): LessonsInUnit | null`
- `getLessonDetailQuery(proposed: ProposedCourse, draftLessonId: string): LessonDetail | null`
- `listDanglingRefsQuery(proposed: ProposedCourse): DanglingRefsReport`

All imports are type-only from `../../types/index.js`. No mutations, no store access, no async.
`course-create-service.ts` is untouched per instruction — Step 7 handles wiring.
`pnpm typecheck` and all 1164 core tests pass.

## Review

Verdict: **done**.

`draft-queries.ts` (146 lines) exports all 4 pure projection functions: `listUnitsQuery`, `listLessonsInUnitQuery`, `getLessonDetailQuery`, and `listDanglingRefsQuery`. Each accepts `(proposed: ProposedCourse, ...)` with no store access, no async, no mutations. All imports are type-only from `../../types/index.js` as designed. The `listDanglingRefsQuery` correctly uses bare string set comparisons (not normalized) for structural integrity checking, matching the design rationale. `pnpm typecheck` and 1164 core tests pass.
