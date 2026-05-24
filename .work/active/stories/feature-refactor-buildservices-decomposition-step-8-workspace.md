---
id: feature-refactor-buildservices-decomposition-step-8-workspace
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-buildservices-decomposition
depends_on:
  - feature-refactor-buildservices-decomposition-step-4-embeddings
  - feature-refactor-buildservices-decomposition-step-5-memory
  - feature-refactor-buildservices-decomposition-step-6-artifacts
  - feature-refactor-buildservices-decomposition-step-7-indexers
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 8: Extract `buildWorkspaceServices()`

## Brief

Extract the "workspace productivity" services — scheduler, lock, tabs, sketch, vision,
notes, flashcards, library, recommendations, progress, and ingestor registry — into
`packages/desktop/electron/main/services/build-workspace-services.ts`.

These services form the student-facing workspace layer: they power the study timeline,
flashcard reviews, note-taking, concept map authoring, and document library. They depend
on `db`, `sqlite`, and several outputs from earlier factories, but are independent of
the session layer (step 9 onwards).

## Services covered

From `packages/desktop/electron/main/services.ts` lines 321–332, 466–524, and 636–655:

```ts
const ingestorRegistry = new IngestorRegistry([...]);   // lines 321–331 (uses visionResolver)
const fsrsScheduler = new FsrsSchedulerImpl();            // line 467
const lockService = new LockServiceImpl({ db, log });     // line 470
const tabsService = new TabsServiceImpl({ db, log });     // line 481
const sketchService = new SketchServiceImpl(...);         // lines 483–485
const visionService = new VisionServiceImpl(...);         // line 489
const notesService = new NotesServiceImpl(...);           // lines 493–498
const flashcardsService = new FlashcardsServiceImpl(...); // lines 500–504
const libraryService = new LibraryServiceImpl(...);       // line 507
const recommendationsService = new RecommendationServiceImpl(...); // lines 511–515
const progressService = new ProgressServiceImpl(...);    // lines 520–524
```

Also `dataDir` (line 483) and `sketchStore` (line 484) — local helper vars, stay internal.

## Target state

New file `packages/desktop/electron/main/services/build-workspace-services.ts`.

Factory signature:

```ts
export function buildWorkspaceServices(deps: {
  db: BetterSQLite3Database;
  sqlite: Database;
  log: MainLogger;
  secretStorage: ElectronSafeStorageAdapter;
  memoryService: MemoryServiceImpl;
  artifactsService: ArtifactsServiceImpl;
  draftStore: SqliteDraftStore;
  visionResolver: () => VisionCapability | undefined;
  embeddedImageStore: FsEmbeddedImageStore;
  pageImageStore: FsPageImageStore;
}): WorkspaceServices
```

Returns all 11 services (plus `ingestorRegistry`).

## Implementation notes

- **`ingestorRegistry`** is placed in this factory rather than embeddings because it
  depends on `visionResolver` (an artifact-domain output, step 6) and `embeddedImageStore`
  (embeddings, step 4). It is logically an ingestion-pipeline component but its
  construction naturally belongs here where both dependencies are in scope.
- **`dataDir` / `sketchStore`**: local to the factory body — not exported.
- **`app.getPath("userData")`**: the Electron `app` import remains in this file (for
  `sketchStore` path construction). No new Electron coupling is introduced.
- **`FsrsSchedulerImpl`**: stateless, no constructor args.
- **`lockService`** is also on the `ServiceDeps.lockService` slot — pass through to the
  `ServiceDeps` assembly in step 10.

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `services.ts` no longer directly instantiates `FsrsSchedulerImpl`, `LockServiceImpl`,
  `TabsServiceImpl`, `SketchServiceImpl`, `VisionServiceImpl`, `NotesServiceImpl`,
  `FlashcardsServiceImpl`, `LibraryServiceImpl`, `RecommendationServiceImpl`,
  `ProgressServiceImpl`, or `IngestorRegistry`.
- `buildWorkspaceServices` is the single construction site for all 12 of the above.
- `sketchStore` and `dataDir` are not exported.

## Risk

Low to medium — 12 services, all with straightforward constructor dependencies.
The only subtle point is `app.getPath("userData")` for the sketch store, which requires
`app.whenReady()` to have resolved; this constraint is already guaranteed by the
`buildServices()` call site and is unchanged.
Rollback: revert the new file and restore the inline blocks in `buildServices()`.

## Implementation notes

- Created `packages/desktop/electron/main/services/build-workspace-services.ts` (165 lines).
- Exported `WorkspaceServiceDeps` and `WorkspaceServices` interfaces + `buildWorkspaceServices()` factory.
- `ingestorRegistry` included in this factory as specified; depends on `visionResolver` (from artifacts, step 6) and `embeddedImageStore` (from embeddings, step 4), both passed via deps.
- `bootstrapEngineResolver` added to deps (needed by `NotesServiceImpl.engineResolver`).
- `dataDir` and `sketchStore` remain local to the factory body — not exported.
- Used `PraxisDb` / `SqliteDatabase` types from `@praxis/core/db` (matching the pattern established by `build-embeddings-services.ts`).
- `pnpm typecheck` and `pnpm --filter @praxis/desktop test` both green (34 files, 520 tests).

## Review

**Verdict: done.**

Shape matches the design exactly. Key checks:

- `buildWorkspaceServices()` exported; returns all 11 services declared in `WorkspaceServices` (ingestorRegistry through progressService).
- `dataDir` and `sketchStore` are local to the factory body — not exported. Satisfies the acceptance criterion.
- `ingestorRegistry` correctly placed in this factory (depends on both `visionResolver` from step-6 and `embeddedImageStore` from step-4).
- `bootstrapEngineResolver` added to `WorkspaceServiceDeps` beyond the story brief — this was needed by `NotesServiceImpl.engineResolver` and is a correct, minimal addition.
- `secretStorage` also on deps (needed by `VisionServiceImpl`) — not in brief but logically required; confirmed harmless addition.
- `PraxisDb` / `SqliteDatabase` types from `@praxis/core/db` used — matches the established sibling pattern.
- `app.getPath("userData")` used for `sketchStore` path; the constraint that `app.whenReady()` has resolved at call time is preserved unchanged by the existing `buildServices()` call site.
- `pnpm typecheck` confirmed green at review time.
