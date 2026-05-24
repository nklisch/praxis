---
id: feature-refactor-course-create-service-decomposition-step-4-extract-chunked-queries
kind: story
stage: implementing
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
