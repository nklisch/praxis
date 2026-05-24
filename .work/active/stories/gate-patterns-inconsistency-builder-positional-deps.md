---
id: gate-patterns-inconsistency-builder-positional-deps
kind: story
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: patterns
created: 2026-05-24
updated: 2026-05-24
---

# Two service builders use positional params instead of a typed deps object

## Existing pattern

`builder-module-composition` — 9 `build-<domain>-services.ts` modules
each export an `<Domain>Services` interface + `build<Domain>Services(deps)`
factory; the orchestrator wires them in dependency order. The canonical
shape is a single typed `*ServiceDeps` parameter object so adding a new
dep is a one-field addition rather than a call-site change.

## Nature of divergence

Two builders take positional parameters instead of a deps object:

- `packages/desktop/electron/main/services/build-memory-services.ts:9`
  — `buildMemoryServices(db: PraxisDb, log: MainLogger)`
- `packages/desktop/electron/main/services/build-embeddings-services.ts`
  — `buildEmbeddingsServices(db, sqlite, log)`

The other 7 builders (secret, sandbox, infra, artifacts, indexers,
workspace, session-precursors, session-assembly) accept a single typed
`<Domain>ServiceDeps` object.

## Required action

Migrate both outliers to the deps-object shape:

```ts
// before
export function buildMemoryServices(
  db: PraxisDb,
  log: MainLogger,
): MemoryServices { … }

// after
export interface MemoryServiceDeps {
  db: PraxisDb;
  log: MainLogger;
}
export function buildMemoryServices(deps: MemoryServiceDeps): MemoryServices {
  const { db, log } = deps;
  …
}
```

Update the single orchestrator call site in `services.ts` to pass
`{ db, log }` / `{ db, sqlite, log }`. No behavior change.

## Scope

2 builder files + 1 orchestrator file. Pure refactor. ~15 line change.
One small PR.

## Provenance

Surfaced by the v0.1.4 patterns gate rerun (2026-05-24) while codifying
the new `builder-module-composition` pattern.
