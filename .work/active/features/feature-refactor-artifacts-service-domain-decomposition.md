---
id: feature-refactor-artifacts-service-domain-decomposition
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

# Decompose `ArtifactsService` into per-domain services

## Brief
`packages/core/src/services/artifacts-service.ts` is 1062 lines with 37 public/async
methods spanning five distinct artifact domains: **courses, lessons, gates, flashcards,
assessments**. It's effectively five services bundled into one class with shared DB access.

The size and breadth make it:
- Hard to navigate (37-method surface in one file)
- Hard to swap or stub in tests (one giant fake covers everything)
- Risky to change (no domain boundary signal)
- Hard to onboard (no answer to "where do flashcards live?")

## Refactor target
Decompose into per-domain services that compose into a facade preserving the existing
`ArtifactsService` interface for backward compatibility:
- `CoursesService` — course CRUD, listing, queries
- `LessonsService` — lesson CRUD, ordering, queries
- `GatesService` — gate CRUD, evaluation, graph operations
- `FlashcardsService` — flashcard CRUD, due-card queries, SRS state
- `AssessmentsService` — assessment shells, item authoring, grading shells

The existing `ArtifactsService` becomes a thin facade that holds and delegates to the
five sub-services. This keeps the IPC channel layer and existing consumers unchanged
while allowing internal callers to depend on narrower interfaces.

## Constraints
- The IPC channel surface (`packages/desktop/electron/main/artifacts-channel.ts`) and
  client SDK shape must stay identical — no UI changes required.
- The Phase 3 dependency-direction rule still applies: only `services/` may import
  `@praxis/engines` / `@praxis/tools` at runtime.
- DB transactions that currently span multiple domains (e.g., creating a course with
  initial lessons) must keep their atomicity — the facade may need to coordinate
  multi-service transactions.

## Discovery evidence
- File length: 1062 lines (verified)
- Method count: 37 public/async
- Domain count: 5 (courses, lessons, gates, flashcards, assessments)

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-artifacts-service-domain-decomposition`
to enumerate the per-service interfaces, transaction boundaries, and migration sequence.
