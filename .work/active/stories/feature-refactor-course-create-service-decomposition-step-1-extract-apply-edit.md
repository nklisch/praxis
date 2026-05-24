---
id: feature-refactor-course-create-service-decomposition-step-1-extract-apply-edit
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-course-create-service-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Extract `applyEdit` and `buildSummary` to `course-create/draft-mutations.ts`

## Priority / Risk
Priority: High — largest single chunk; extracted pure functions enable independent testing.
Risk: Low — pure functions with no side effects; the service just calls them by import.

## Files affected
- **New**: `packages/core/src/services/course-create/draft-mutations.ts`
- **Modified**: `packages/core/src/services/course-create-service.ts`

## Current state
`applyEdit` (lines 930–1155) is a 225-line exhaustive `switch` over every `DraftEditOp` variant.
`buildSummary` (lines 889–908) is a pure helper co-located in the same file.
Both are module-private helpers defined after the class closing brace.

## Target state
Move `applyEdit`, `buildSummary`, and the `EditResult` interface + `ok` helper into
`packages/core/src/services/course-create/draft-mutations.ts`.
Export them for consumption by `course-create-service.ts`.
`course-create-service.ts` imports them from `./course-create/draft-mutations.js`.

## Implementation notes
- `applyEdit` uses `normalizeConceptName` (two call-sites at `add-edge` branch, lines 1101–1113).
  Import it from `./helpers.js` (sibling in the same directory after move).
- `applyEdit` also calls `validateProposed` in the `validate-draft` branch (line 1142).
  Import it from `./draft-validator.js` (sibling).
- No DB access — pure transformation on `ProposedCourse`.
- Export: `export function applyEdit(...)`, `export function buildSummary(...)`,
  `export type { EditResult }`.
- The `ok` helper is only used inside `applyEdit`; can remain unexported.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass.
- External `CourseCreateService` interface unchanged.
- All existing tests pass without modification.
- `course-create-service.ts` line count drops by ~270 lines.

## Risk + Rollback
Risk: Low — pure functions, no runtime behaviour change.
Rollback: revert the new file and inline the functions back; one-step revert.
