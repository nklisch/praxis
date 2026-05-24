---
id: feature-refactor-course-create-service-decomposition-step-2-fix-normalize-export
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-course-create-service-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Fix `normalizeConceptName` leaky abstraction via barrel re-export

## Priority / Risk
Priority: High — resolves the identified leaky-abstraction finding; unblocks a clear module boundary.
Risk: Low — import path change only, no logic change.

## Files affected
- **New**: `packages/core/src/services/course-create/index.ts`
- **Modified**: `packages/core/src/services/course-create-service.ts`

## Current state
`course-create-service.ts` (in `services/`) reaches into the `course-create/` subdirectory's
internal file: `import { normalizeConceptName } from "./course-create/helpers.js"`.
This violates the module-boundary principle: consumers should import from the module's
public surface, not from internal implementation files.

`draft-validator.ts` (sibling of `helpers.ts`) imports it correctly as a same-directory import.

## Target state
Create `packages/core/src/services/course-create/index.ts` as the module barrel.
Re-export `normalizeConceptName` (and `Issue`, `validateProposed`, `persistDraftTx`,
`PersistDraftTxArgs`) from the barrel so that:
- `course-create-service.ts` imports `normalizeConceptName` from
  `./course-create/index.js` (the module boundary).
- Future step-1's `draft-mutations.ts` also imports from `./helpers.js`
  (same-directory, fine) or from the barrel if preferred.

The barrel makes the `course-create/` subdirectory a proper module with an explicit API surface.

## Implementation notes
- `index.ts` content:
  ```ts
  export { normalizeConceptName } from "./helpers.js";
  export { type Issue, validateProposed } from "./draft-validator.js";
  export { persistDraftTx, type PersistDraftTxArgs } from "./draft-persistence.js";
  ```
- In `course-create-service.ts`, change the three separate imports from
  `./course-create/helpers.js`, `./course-create/draft-validator.js`, and
  `./course-create/draft-persistence.js` to a single import from `./course-create/index.js`.
- After step 1 lands, `draft-mutations.ts` (same directory) keeps its internal imports —
  it does not need to go through the barrel.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass.
- No external package import paths change — this only affects `services/` internal imports.
- `helpers.ts`, `draft-validator.ts`, `draft-persistence.ts` are unchanged.

## Risk + Rollback
Risk: Low — import-path change only.
Rollback: delete `index.ts`, restore the three direct imports in the service.
