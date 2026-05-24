---
id: feature-refactor-course-create-service-decomposition
kind: feature
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Decompose `CourseCreateServiceImpl` into focused modules

## Brief
`packages/core/src/services/course-create-service.ts` is 1155 lines owning the entire
drafting lifecycle in one class:
- Draft creation + caching
- Mutation dispatch (add/remove unit, lesson, concept, edge, assessment plan)
- Validation
- Serialization
- `persistDraft` (the multi-domain transaction that materialises units + lessons +
  assessment shells)
- Stale-draft sweep
- `confirmDraft` (lines 524–598) — multi-concern transaction handler

This is one of the most concept-dense services in the codebase and is touched by
basically every drafter-related change.

## Refactor target
Extract focused modules called by a thinner `CourseCreateServiceImpl`:
- `DraftStore` — in-memory draft cache + persistence boundary
- `DraftValidator` — confirmation-time validation rules (resolves references, minimum
  bar checks)
- `DraftPersister` — owns the `persistDraft` transaction (currently inlined as
  `persistDraftTx` in `./course-create/draft-persistence.js` but called from the
  service via private import; should become a first-class collaborator)
- Mutation handlers — group the `add*` / `remove*` / `set*` methods by target
  (units, lessons, concepts, edges, assessments)

`CourseCreateServiceImpl` becomes the orchestrator that wires these together and exposes
the existing service interface unchanged.

## Constraints
- The service's external interface (consumed by `course.draft_*` tools + IPC channels)
  must stay identical.
- `persistDraft` atomicity must be preserved — units + lessons + assessment shells land
  in one DB transaction or none.
- The drafter agent loop in `packages/curriculum/src/course-create/drafter.ts` calls
  into this service via tool dispatch — no changes there.
- `normalizeConceptName` is currently imported from `./course-create/helpers.js` as an
  internal helper; the leaky-abstraction finding (consumers reaching past a module's
  public API) should also resolve here.

## Discovery evidence
- File length: 1155 lines (verified)
- `confirmDraft` complexity: lines 524–598, multi-concern
- Internal helper imports: `normalizeConceptName` from `./course-create/helpers.js`,
  `persistDraftTx` from `./course-create/draft-persistence.js`

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-course-create-service-decomposition`
to enumerate the module split, public API for `helpers.js`, and migration sequence.
