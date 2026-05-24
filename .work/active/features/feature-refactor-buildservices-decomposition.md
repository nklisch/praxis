---
id: feature-refactor-buildservices-decomposition
kind: feature
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-24
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

---

## Refactor Overview

Ten child stories implement the split. Steps 1–5 are fully parallel (no inter-story
dependencies). Steps 6–9 have cascading dependencies on earlier steps. Step 10 is the
final wiring step that depends on all nine extract stories.

Each factory is extracted to a new file under
`packages/desktop/electron/main/services/build-<domain>-services.ts`.
`buildServices()` becomes the orchestrator — ≤200 lines — that calls each factory,
threads outputs as explicit parameters to downstream factories, closes both ref-cells,
and assembles `ServiceDeps`.

### Construction order (load-bearing constraints preserved)

```
openDb()                                             ← always first
│
├── buildInfraServices(log)                          ← step 1 (parallel-eligible)
├── buildSecretServices(log)                         ← step 2 (parallel-eligible)
├── buildSandboxServices()                           ← step 3 (parallel-eligible)
├── buildEmbeddingsServices(db, sqlite, log)         ← step 4 (parallel-eligible)
└── buildMemoryServices(db, log)                     ← step 5 (parallel-eligible)
    │
    └── buildArtifactsServices({..., memoryService, secretStorage, sandbox}) ← step 6
        │
        ├── buildIndexerServices({..., artifactsService, activityRegistry})  ← step 7
        │
        ├── buildWorkspaceServices({..., artifactsService, draftStore})      ← step 8
        │
        └── buildSessionPrecursors({..., artifactsService, conceptMapService}) ← step 9
            │
            └── buildServices() orchestrator — wire, assemble ServiceDeps, ← step 10
                SessionServiceImpl, close ref-cells, start sweep
```

---

## Refactor Steps

### Step 1 — `buildInfraServices()` · Priority: High · Risk: Low

**File**: `packages/desktop/electron/main/services/build-infra-services.ts` (new)

**Current**: `ActivityRegistryImpl`, `SubAgentRegistryImpl`, `QuickCheckServiceImpl`
constructed inline at the top of `buildServices()` (lines 203–215).

**Target**: `buildInfraServices(log)` returns `{ activityRegistry, subAgentRegistry, quickCheckService }`.

**Acceptance**: `pnpm typecheck && pnpm lint && pnpm test` green; services.ts no longer
directly constructs any of the three.

**Rollback**: revert new file; restore three inline blocks.

---

### Step 2 — `buildSecretServices()` · Priority: High · Risk: Low

**File**: `packages/desktop/electron/main/services/build-secret-services.ts` (new)

**Current**: `ElectronSafeStorageAdapter`, `ClaudeAuthServiceImpl` inline (lines 474–477).

**Target**: `buildSecretServices(log)` returns `{ secretStorage, claudeAuthService }`.

**Note**: must be called after `app.whenReady()` — guaranteed by call site, unchanged.

**Rollback**: revert new file; restore two inline lines.

---

### Step 3 — `buildSandboxServices()` · Priority: High · Risk: Low

**File**: `packages/desktop/electron/main/services/build-sandbox-services.ts` (new)

**Current**: `PyodideHost`, `PyodideSymPyService`, `CodeSandboxImpl`, `createCodeSandboxTool`
inline (lines 217–226).

**Target**: `buildSandboxServices()` (no args) returns `{ pyodide, sympy, sandbox, codeSandboxTool }`.

**Rollback**: revert new file; restore four inline lines.

---

### Step 4 — `buildEmbeddingsServices()` · Priority: High · Risk: Medium

**File**: `packages/desktop/electron/main/services/build-embeddings-services.ts` (new)

**Current**: `SqliteVecStore`, `SqliteFtsStore`, `spawnNodeWorker`, `WorkerEmbeddingService`,
`FsPageImageStore`, `FsEmbeddedImageStore`, `DrizzleDocumentsReader`,
`SqliteConceptEmbeddingsStore`, `PackImportServiceImpl`, `PedagogyPackServiceImpl`
inline (lines 229–277). Module-level `EMBEDDINGS_MODEL_ID`, `EMBEDDINGS_DIMENSION`,
`requireFromHere`, `resolveDistPath` also move here.

**Target**: `buildEmbeddingsServices(db, sqlite, log)` returns the 10-service slice.
Module-level constants move wholesale into the new file.

**Risk note**: path-resolution logic (`resolveDistPath`) is being moved, not changed.
Verify packaged build path still resolves via smoke-test `dist:dir`.

**Rollback**: revert new file; restore inline blocks + module-level constants.

---

### Step 5 — `buildMemoryServices()` · Priority: High · Risk: Low

**File**: `packages/desktop/electron/main/services/build-memory-services.ts` (new)

**Current**: `MemoryServiceImpl` inline (lines 333–339).

**Target**: `buildMemoryServices(db, log)` returns `{ memoryService }`.

**Note**: must be called before step 6 (ordering constraint: memory → assignment → artifacts).

**Rollback**: revert new file; restore one inline block.

---

### Step 6 — `buildArtifactsServices()` · Priority: High · Risk: Medium

**File**: `packages/desktop/electron/main/services/build-artifacts-services.ts` (new)

**Current**: Three engine-resolver closures, `DocumentScopesServiceImpl`,
`CitationsServiceImpl`, `SqliteDraftStore`, `CourseCreateServiceImpl`,
`notifyParentSessionRef` ref-cell, `AssignmentServiceImpl`, `ArtifactsServiceImpl`
inline (lines 279–389).

**Target**: `buildArtifactsServices({db, log, secretStorage, memoryService, sympy, sandbox})`
returns the service slice plus `setNotifyParentSession` setter.

**Key pattern**: `notifyParentSessionRef` becomes a module-internal `let`; factory
returns `setNotifyParentSession(fn)`. Orchestrator calls the setter after `SessionServiceImpl`
is live.

**depends_on**: steps 2, 3, 5.

**Rollback**: revert new file; restore inline blocks.

---

### Step 7 — `buildIndexerServices()` · Priority: High · Risk: Low

**File**: `packages/desktop/electron/main/services/build-indexer-services.ts` (new)

**Current**: `readSessionCourseId` helper, `conceptMapConfiguratorId`, `ConceptMapServiceImpl`,
`ConceptMapSnapshotter`, `ConceptMapDivergenceIndexer`, `MasteryIndexer`,
`MisconceptionIndexer`, `AffectiveIndexer`, `ProceduralIndexer`,
`IndexerOrchestratorImpl` inline (lines 315–464).

**Target**: `buildIndexerServices({db, log, artifactsService, bootstrapEngineResolver, pedagogyPackService, activityRegistry})`
returns `{ conceptMapService, conceptMapConfiguratorId, indexerOrchestrator }`.

`readSessionCourseId` is factory-internal (not exported).

**depends_on**: steps 1, 4, 6.

**Rollback**: revert new file; restore inline blocks.

---

### Step 8 — `buildWorkspaceServices()` · Priority: High · Risk: Low

**File**: `packages/desktop/electron/main/services/build-workspace-services.ts` (new)

**Current**: `IngestorRegistry`, `FsrsSchedulerImpl`, `LockServiceImpl`, `TabsServiceImpl`,
`SketchServiceImpl`, `VisionServiceImpl`, `NotesServiceImpl`, `FlashcardsServiceImpl`,
`LibraryServiceImpl`, `RecommendationServiceImpl`, `ProgressServiceImpl` inline (multiple
ranges across lines 321–524).

**Target**: `buildWorkspaceServices({db, sqlite, log, secretStorage, memoryService, artifactsService, draftStore, visionResolver, embeddedImageStore, pageImageStore})`
returns the 12-service slice.

**depends_on**: steps 4, 5, 6, 7.

**Rollback**: revert new file; restore inline blocks.

---

### Step 9 — `buildSessionPrecursors()` · Priority: High · Risk: Medium

**File**: `packages/desktop/electron/main/services/build-session-precursors.ts` (new)

**Current**: `sessionServiceRef` ref-cell, `SessionPromotionRegistryImpl`,
`PromptCustomizationServiceImpl`, `AuthoringServiceImpl` inline (lines 529–558).

**Target**: `buildSessionPrecursors({db, log, artifactsService, memoryService, conceptMapService, conceptMapConfiguratorId})`
returns `{ sessionPromotionRegistry, setSessionServiceRef, promptCustomizationService, authoringService }`.

`sessionServiceRef` becomes module-internal; `setSessionServiceRef` setter closes the ref.

**depends_on**: steps 6, 7, 8.

**Rollback**: revert new file; restore inline blocks.

---

### Step 10 — Wire orchestrator (slim `buildServices()`) · Priority: High · Risk: Medium

**File**: `packages/desktop/electron/main/services.ts` (modified)

**Current**: `buildServices()` is 522 lines (the entire god function).

**Target**: `buildServices()` is ≤150 lines:
- Calls each factory in construction order (steps 1–9)
- Keeps inline: `modes` map, `toolDefinitions` array, `ServiceDeps` assembly block
- Keeps inline: `IngestionService`, `DocumentsServiceImpl`, `SessionServiceImpl`, `SessionSweepIndexer`
- Closes both ref-cells after `SessionServiceImpl` is live
- Removes all orphaned imports (Biome `noUnusedImports` surfaces stragglers)
- Smoke-tests: `pnpm typecheck && pnpm lint && pnpm test` + `dist:dir`

**depends_on**: steps 1–9 (all extracts must be complete and green).

**Rollback**: revert all factory files (steps 1–9 commits) and restore services.ts from git.

---

## Implementation Order

**Wave 1 (fully parallel — no inter-story deps)**
- Step 1: `buildInfraServices()`
- Step 2: `buildSecretServices()`
- Step 3: `buildSandboxServices()`
- Step 4: `buildEmbeddingsServices()`
- Step 5: `buildMemoryServices()`

**Wave 2 (depends on wave 1 subsets)**
- Step 6: `buildArtifactsServices()` — after steps 2, 3, 5

**Wave 3 (depends on step 6)**
- Step 7: `buildIndexerServices()` — after steps 1, 4, 6
- Step 8: `buildWorkspaceServices()` — after steps 4, 5, 6

(Steps 7 and 8 are parallel with each other.)

**Wave 4 (depends on steps 6, 7, 8)**
- Step 9: `buildSessionPrecursors()` — after steps 6, 7, 8

**Wave 5 (final — depends on all extracts)**
- Step 10: Wire orchestrator — after steps 1–9

## Tricky ordering decisions

1. **`ingestorRegistry` placement**: logically an ingestion primitive, but it closes over
   `visionResolver` (a step-6 output). Placed in step 8 (`buildWorkspaceServices`) where
   both deps are in scope.

2. **`readSessionCourseId` helper**: referenced by six indexers. Factory-internal to step 7
   (not exported); the indexers are also internal to the same factory, so the helper need
   not cross module boundaries.

3. **`conceptMapConfiguratorId` thunk**: returned from step 7 and passed to step 9
   (`AuthoringServiceImpl`). Keeping it on the step-7 returned slice makes the
   single-configurator design constraint explicit at the call site.

4. **Ref-cell closures**: both `notifyParentSessionRef` (step 6) and `sessionServiceRef`
   (step 9) are resolved in the step-10 orchestrator after `SessionServiceImpl` is live.
   The ordering constraint (sweep must start only after both are resolved) is preserved by
   explicit sequencing in `buildServices()`.

5. **`PromptCustomizationServiceImpl`**: only dep is `db`. Placed in step 9 because it is
   the direct input to `AuthoringServiceImpl` and used nowhere else before session assembly.

## Children complete (2026-05-24)

All 10 child stories advanced to `stage: done`. Feature advanced to `stage: review`.

## Review (2026-05-24)

**Verdict: approved — advanced to `done`.**

All 10 child stories landed cleanly:

- **9 new factory files** created under `packages/desktop/electron/main/services/`:
  `build-infra-services.ts`, `build-secret-services.ts`, `build-sandbox-services.ts`,
  `build-embeddings-services.ts`, `build-memory-services.ts`, `build-artifacts-services.ts`,
  `build-indexer-services.ts`, `build-workspace-services.ts`, `build-session-precursors.ts`.

- **`services.ts` reduced from 721 → 379 lines** (−342 lines, −47%). `buildServices()` is
  now a ≤200-line orchestrator that calls each factory in construction order and assembles
  `ServiceDeps`.

- **No behavioral regressions**: `pnpm typecheck` clean across all 10 packages; all 520
  tests pass; construction order (DB-first, ref-cell closures after `SessionServiceImpl`)
  preserved exactly.

- **Constraints met**: Phase 3 exception (only `packages/core/src/services/` imports
  `@praxis/engines` at runtime) unaffected — all new factories live in
  `packages/desktop/electron/main/services/`.
