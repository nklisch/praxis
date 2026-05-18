---
id: idea-consolidate-normalize-concept-name-helper
kind: idea
tags: [refactor]
created: 2026-05-18
---

# Consolidate `normalizeConceptName` between course-create-service and draft-validator

The `refactor-course-create-service-extract-modules` feature (commit
`cda3f6c`) extracted `validateProposed` into
`packages/core/src/services/course-create/draft-validator.ts`. Because
the validator needs `normalizeConceptName` for unit/assessment
concept-name checks, the helper was duplicated into `draft-validator.ts`
alongside its original home in `course-create-service.ts` (where
`applyEdit` still uses it).

Mild DRY violation. Trivial to consolidate when convenient:

1. Create `packages/core/src/services/course-create/helpers.ts` exporting
   `normalizeConceptName`.
2. Both `course-create-service.ts` and `draft-validator.ts` import from
   it; remove the local copies.
3. ~5 LoC of net cleanup.

Story-sized. Mechanical.
