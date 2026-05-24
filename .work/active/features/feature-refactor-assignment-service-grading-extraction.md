---
id: feature-refactor-assignment-service-grading-extraction
kind: feature
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Extract grading orchestration from `AssignmentService`

## Brief
`packages/core/src/services/assignment-service.ts` (725 lines) bundles three
distinct concerns:
- (a) Assignment CRUD (create, list, fetch, submit)
- (b) Per-item response tracking + debounced auto-save
- (c) Multi-path grading (item-type-specific graders, approach feedback, rubric agent)

The Zod schemas + `validateItems` (~lines 40–380) are tightly coupled to the
grading path, not the CRUD path. A `graders/` subdirectory already exists for
the per-grader implementations, but the orchestration logic stays inline in
`AssignmentService`.

## Refactor target
Extract grading orchestration into a `GradingOrchestrator` sub-service that
handles:
- Registry dispatch (item-type → grader)
- Approach-feedback enrichment
- Rubric-agent sequencing

`AssignmentService` becomes a facade with CRUD + response tracking, delegating
grading to the orchestrator. Same pattern as the just-shipped `ArtifactsService`
facade decomposition.

## Constraints
- Public `AssignmentService` interface unchanged (consumers + IPC channels)
- `submit()` atomicity preserved
- Per-item-type graders in `graders/` directory stay where they are; the
  extraction only lifts the dispatch + enrichment + sequencing logic

## Discovery evidence
- File length: 725 lines (verified)
- Multi-responsibility: CRUD + tracking + grading
- `validateItems` and Zod schemas tightly coupled to grading path
- Discovered by autopilot refactor cadence after the artifacts-service split landed

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-assignment-service-grading-extraction`
to enumerate the extraction steps, sub-service interface, and migration sequence.
