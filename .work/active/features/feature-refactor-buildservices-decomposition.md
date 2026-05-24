---
id: feature-refactor-buildservices-decomposition
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

# Decompose `buildServices()` in desktop main into domain factories

## Brief
`packages/desktop/electron/main/services.ts` is 721 lines, of which `buildServices()` itself
is ~522 lines (lines 199–721). It instantiates 40+ services across distinct domains
(embeddings workers, vision resolver, sandbox, indexers, engines, memory, curriculum,
runtime, db, tools, drafter) inside one function with deep nesting. No internal helpers
are extracted — the function reads as a single wall of wiring.

This is the composition root for the Electron main process, so it's load-bearing, but
its current shape makes it hard to:
- Reason about which services depend on which (no grouping signal)
- Test sub-graphs in isolation (factories aren't broken out)
- Add a new service without growing the wall

## Refactor target
Extract per-domain factory functions called by a slimmed `buildServices()`:
- `buildEmbeddingsServices(...)`
- `buildVisionServices(...)`
- `buildSandboxServices(...)`
- `buildMemoryServices(...)`
- `buildRuntimeServices(...)`
- `buildEngineServices(...)`
- `buildCurriculumServices(...)`
- `buildToolRegistry(...)`
- (etc — final grouping decided during per-feature design)

`buildServices()` becomes the conductor that wires the factory results into the final
`ServiceDeps` container.

## Constraints
- Behavior must be preserved exactly — same `ServiceDeps` shape, same construction
  order where ordering is load-bearing (e.g., DB-before-services, embeddings-before-indexers).
- The Phase 3 exception (only `packages/core/src/services/` may import `@praxis/engines`
  and `@praxis/tools` at runtime) must continue to hold — the factories live in
  `packages/desktop/electron/main/`.

## Discovery evidence
- File length: 721 lines (verified)
- `buildServices()` body: 522 lines (lines 199–721)
- 40+ service instantiations
- Deep nesting throughout

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-buildservices-decomposition`
to enumerate the exact factory split, ordering constraints, and per-factory tests.
