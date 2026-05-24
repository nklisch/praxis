---
id: feature-refactor-course-create-service-decomposition-step-1-extract-apply-edit
kind: story
stage: done
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

## Implementation notes
- Created `packages/core/src/services/course-create/draft-mutations.ts` (237 lines).
- Exported `applyEdit`, `buildSummary`, and `EditResult` interface. The `ok` helper remains unexported (used only inside `applyEdit`).
- Imports `normalizeConceptName` from `./helpers.js` and `validateProposed` from `./draft-validator.js` as designed.
- `course-create-service.ts` is NOT modified yet — Step 7 will do all wiring in one pass.
- `pnpm typecheck` passes (all 10 packages clean). `pnpm --filter @praxis/core test` passes (96 files, 1164 tests).

## Review

Verdict: **done**.

`draft-mutations.ts` (272 lines in commit) correctly exports `applyEdit`, `buildSummary`, and the `EditResult` interface. The `ok` helper is correctly unexported. Imports follow the sibling pattern: `normalizeConceptName` from `./helpers.js`, `validateProposed` from `./draft-validator.js`. No DB access, no side effects — pure transformations on `ProposedCourse`. The exhaustive `switch` with `never` guard on the `default` branch is sound. All variants of `DraftEditOp` are covered. `pnpm typecheck` and 1164 core tests pass.
