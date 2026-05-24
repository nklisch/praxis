---
id: feature-refactor-assignment-service-grading-extraction-step-2-extract-schema-helpers
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-assignment-service-grading-extraction
depends_on:
  - feature-refactor-assignment-service-grading-extraction-step-1-extract-blending
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Extract Zod schemas and helper functions into grading-specific modules

## Priority / Risk
Priority: High (prerequisite for Step 3)
Risk: Medium — exported symbols (`AssignmentItemSchema`, `validateItems`) are referenced
by `services/index.ts` and by the tool boundary in `@praxis/tools`; exports must be
re-exported from `assignment-service.ts` to maintain the current public surface.

## Files touched
- `packages/core/src/services/graders/item-schemas.ts` — **new**: Zod schemas + `validateItems` + `validateRubricWeights`
- `packages/core/src/services/graders/submission-helpers.ts` — **new**: `composeSubmissionNote` + `rowToAssignment`
- `packages/core/src/services/graders/index.ts` — add exports for both new modules
- `packages/core/src/services/assignment-service.ts` — import from new modules; keep
  `export { AssignmentItemSchema, validateItems }` as re-exports so downstream consumers
  (`services/index.ts`, tools package) see no change

## Current state

### Schemas (lines 40–254 of `assignment-service.ts`)
`RubricCriterionSchema`, `RubricSchema`, `BaseItem`, `WithReasoning`,
`AssignmentItemSchema` (exported), `validateItems` (exported), `validateRubricWeights`
are all defined in `assignment-service.ts`. They are tightly coupled to the grading
path (used in graders, `submit()`, and the tool boundary) but have no dependency on
CRUD logic.

### Helpers (lines 256–308)
`rowToAssignment` converts a Drizzle row → domain `Assignment`. `composeSubmissionNote`
composes the teacher-visible system note from a grade result. Both are pure; neither
belongs in the grading loop itself.

## Target state
- `graders/item-schemas.ts`: all Zod schemas + `validateItems` + `validateRubricWeights`
- `graders/submission-helpers.ts`: `rowToAssignment` (needs `AssignmentRow` type; import
  `typeof assignments.$inferSelect` from the schema) + `composeSubmissionNote`
- `assignment-service.ts`: re-exports `AssignmentItemSchema` and `validateItems` from
  `./graders/item-schemas.js` so external callers see no change; imports
  `rowToAssignment` and `composeSubmissionNote` from `./graders/submission-helpers.js`

## Implementation notes
- `AssignmentRow` type can be local to `submission-helpers.ts`:
  `type AssignmentRow = typeof assignments.$inferSelect`
- `graders/item-schemas.ts` imports only `zod` and `AssignmentItem` from core types —
  no circular dependency risk
- `graders/submission-helpers.ts` imports from `@praxis/artifacts/schema` (for
  `assignments` table), `../../types/index.js`, and `../../../types/artifacts.js` — all
  within the permitted dependency direction
- After this step `assignment-service.ts` shrinks by ~270 lines

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass, including the `assignment-service.notify` tests
- `import { AssignmentItemSchema, validateItems } from "@praxis/core/services"` still resolves
  (verified by the export chain through `services/index.ts`)
- `assignment-service.ts` no longer contains the Zod schema block or `rowToAssignment`/`composeSubmissionNote`

## Rollback
Revert `graders/item-schemas.ts`, `graders/submission-helpers.ts`, edits to
`graders/index.ts`, and edits to `assignment-service.ts`. No DB, IPC, or behavioural change.
