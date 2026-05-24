---
id: feature-refactor-buildservices-decomposition-step-7-indexers
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-buildservices-decomposition
depends_on:
  - feature-refactor-buildservices-decomposition-step-1-infra
  - feature-refactor-buildservices-decomposition-step-4-embeddings
  - feature-refactor-buildservices-decomposition-step-6-artifacts
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 7: Extract `buildIndexerServices()`

## Brief

Extract the concept map service, all six indexers, the indexer orchestrator, and the
`readSessionCourseId` helper into
`packages/desktop/electron/main/services/build-indexer-services.ts`.

These services collectively form the memory projection pipeline: they run post-turn and
session-end to project episodic events into mastery, misconceptions, affective signals,
procedural signals, and concept maps.

## Services covered

From `packages/desktop/electron/main/services.ts` lines 315–464:

```ts
const readSessionCourseId = (sessionId: string): string | null => { ... }; // line 315
const conceptMapConfiguratorId = () => "default" as ConfiguratorId;         // line 411
const conceptMapService = new ConceptMapServiceImpl(...);                    // line 412
const conceptMapSnapshotter = new ConceptMapSnapshotter(...);                // line 418
const conceptMapDivergenceIndexer = new ConceptMapDivergenceIndexer(...);   // line 424
const masteryIndexer = new MasteryIndexer(...);                              // line 391
const misconceptionIndexer = new MisconceptionIndexer(...);                  // line 398
const affectiveIndexer = new AffectiveIndexer(...);                          // line 435
const proceduralIndexer = new ProceduralIndexer(...);                        // line 443
const indexerOrchestrator = new IndexerOrchestratorImpl(...);               // line 452
```

## Target state

New file `packages/desktop/electron/main/services/build-indexer-services.ts`.

Factory signature:

```ts
export function buildIndexerServices(deps: {
  db: BetterSQLite3Database;
  log: MainLogger;
  artifactsService: ArtifactsServiceImpl;
  bootstrapEngineResolver: () => Engine;
  pedagogyPackService: PedagogyPackServiceImpl;
  activityRegistry: ActivityRegistryImpl;
}): IndexerServices
```

Returns:

```ts
export interface IndexerServices {
  conceptMapService: ConceptMapServiceImpl;
  /** The singleton configurator-id thunk — also used by AuthoringServiceImpl. */
  conceptMapConfiguratorId: () => ConfiguratorId;
  indexerOrchestrator: IndexerOrchestratorImpl;
}
```

`conceptMapService` and `conceptMapConfiguratorId` are returned because they are consumed
downstream (step 8 workspace services needs `conceptMapService` for `AuthoringServiceImpl`,
and step 9 session assembly uses them too). The six indexers and orchestrator internals
need not be on the returned slice.

## Implementation notes

- **`readSessionCourseId`**: kept local to the factory (not exported). All indexers that
  need it receive it as a closure — no change to consumer behaviour.
- **`conceptMapConfiguratorId`**: exported as part of the returned slice so that
  `AuthoringServiceImpl` (step 8) and any future consumers receive the same thunk identity.
- **Construction order within the factory**: `conceptMapService` before all indexers that
  reference it (`conceptMapSnapshotter`, `conceptMapDivergenceIndexer`); `IndexerOrchestratorImpl`
  last. Order is exactly as in `buildServices()` today — copy it.
- **`bootstrapEngineResolver`**: passed in from step 6's returned slice.

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `services.ts` no longer directly instantiates `ConceptMapServiceImpl`,
  `ConceptMapSnapshotter`, `ConceptMapDivergenceIndexer`, `MasteryIndexer`,
  `MisconceptionIndexer`, `AffectiveIndexer`, `ProceduralIndexer`, or
  `IndexerOrchestratorImpl`.
- `readSessionCourseId` is not exported — it is internal to the factory.
- The `indexerOrchestrator` slot on `ServiceDeps` continues to receive the same
  `IndexerOrchestratorImpl` instance.

## Risk

Low — all six indexers are post-turn/session-end side effect runners; extracting
their construction has no behavioural impact. The only subtle point is passing
`conceptMapConfiguratorId` through to the workspace-services step.
Rollback: revert the new file and restore the inline blocks in `buildServices()`.

## Implementation notes

- Created `packages/desktop/electron/main/services/build-indexer-services.ts` (148 lines).
- Used `PraxisDb` (the project's canonical Drizzle db type alias) rather than the raw `BetterSQLite3Database` mentioned in the story brief — consistent with all other sibling factory files.
- `readSessionCourseId` is factory-internal as specified; it closes over `db` and is passed as a callback to each indexer that needs it.
- `IndexerServiceDeps` and `IndexerServices` interfaces are exported; the six indexer instances and `conceptMapSnapshotter` are not on the returned slice.
- Construction order preserved exactly as in `buildServices()`: mastery/misconception → conceptMapConfiguratorId/conceptMapService → snapshotter/divergenceIndexer → affective → procedural → orchestrator.
- `pnpm typecheck` and `pnpm --filter @praxis/desktop test` both green (520 tests pass).
