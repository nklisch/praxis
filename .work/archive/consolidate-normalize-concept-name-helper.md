---
id: consolidate-normalize-concept-name-helper
kind: story
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Consolidate `normalizeConceptName` between course-create-service and draft-validator

## Brief

The `refactor-course-create-service-extract-modules` feature (commit
`cda3f6c`) extracted `validateProposed` into
`packages/core/src/services/course-create/draft-validator.ts`. Because
the validator needs `normalizeConceptName` for unit/assessment
concept-name checks, the helper was duplicated into `draft-validator.ts`
alongside its original home in `course-create-service.ts` (where
`applyEdit` still uses it).

Mild DRY violation. Trivial to consolidate.

## Implementation plan

1. Create `packages/core/src/services/course-create/helpers.ts` exporting
   `normalizeConceptName`.
2. Both `course-create-service.ts` and `draft-validator.ts` import from
   it; remove the local copies.
3. ~5 LoC of net cleanup.

Story-sized. Mechanical.

## Implementation notes

**Files created:**
- `packages/core/src/services/course-create/helpers.ts` — exports `normalizeConceptName` with its JSDoc comment

**Files modified:**
- `packages/core/src/services/course-create-service.ts` — removed local `const normalizeConceptName`, added import from `./course-create/helpers.js`
- `packages/core/src/services/course-create/draft-validator.ts` — removed local `const normalizeConceptName`, added import from `./helpers.js`

**Also checked:** `draft-persistence.ts` — does not use `normalizeConceptName`; left untouched.

**Verification:**
- `pnpm --filter @praxis/core build` — clean
- `pnpm --filter @praxis/core typecheck` — clean
- `pnpm biome check` on the 3 modified files — clean (root `pnpm lint` has pre-existing `.mockups/` HTML errors unrelated to this change)
- `pnpm --filter @praxis/core test` — 86 test files, 1060 tests, all passed

No deviations from the plan.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Textbook DRY consolidation. One new file (2 lines), one local definition removed from each of the 2 call sites, plain `import` (runtime value — correct under `verbatimModuleSyntax: true`). `draft-persistence.ts` correctly checked and left untouched (doesn't use the helper). Net delta is tiny and the helper now has a single home.
