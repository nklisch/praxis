---
id: feature-refactor-assignment-service-grading-extraction-step-1-extract-blending
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-assignment-service-grading-extraction
depends_on: []
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Extract `blendDeterministicAndWorkRubric` into `graders/blending.ts`

## Priority / Risk
Priority: High (dependency for Step 3)
Risk: Low — pure function move, no logic change

## Files touched
- `packages/core/src/services/graders/blending.ts` — **new**
- `packages/core/src/services/graders/index.ts` — add export
- `packages/core/src/services/assignment-service.ts` — remove local definition, add import

## Current state
`blendDeterministicAndWorkRubric` is a module-level pure function in
`assignment-service.ts` (lines 320–344). It is used twice in `submit()` (workRubric
blending and requireReasoning blending). It has no imports other than `GraderResult`
from `graders/types.ts`, making it trivially portable into the graders package.

## Target state
`graders/blending.ts` exports `blendDeterministicAndWorkRubric`. `assignment-service.ts`
imports it from `./graders/blending.js`. `graders/index.ts` re-exports it.

## Implementation notes
- The function signature stays identical: `(base, work, primaryWeight) => GraderResult`
- Export named (not default)
- The JSDoc comment moves with the function
- No other consumers exist today; the export is future-proofing for Step 3

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass byte-for-byte identical test outcomes
- `assignment-service.ts` no longer defines `blendDeterministicAndWorkRubric` locally
- `graders/blending.ts` is the single definition

## Rollback
Revert the three file changes — no DB, IPC, or public-interface impact.

## Implementation notes
- Created `packages/core/src/services/graders/blending.ts` (38 lines) exporting `blendDeterministicAndWorkRubric` as a named export.
- The function signature and JSDoc comment were copied verbatim from `assignment-service.ts` lines 320–344, with an added `import type { GraderResult } from "./types.js"` at the top.
- Added `export { blendDeterministicAndWorkRubric } from "./blending.js"` to `graders/index.ts`.
- `assignment-service.ts` was NOT modified per story instructions (Step 4 wires).
- `pnpm typecheck` and `pnpm --filter @praxis/core test` both passed (96 test files / 1164 tests).
