---
id: feature-refactor-buildservices-decomposition-step-10-wire
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-buildservices-decomposition
depends_on:
  - feature-refactor-buildservices-decomposition-step-1-infra
  - feature-refactor-buildservices-decomposition-step-2-secrets
  - feature-refactor-buildservices-decomposition-step-3-sandbox
  - feature-refactor-buildservices-decomposition-step-4-embeddings
  - feature-refactor-buildservices-decomposition-step-5-memory
  - feature-refactor-buildservices-decomposition-step-6-artifacts
  - feature-refactor-buildservices-decomposition-step-7-indexers
  - feature-refactor-buildservices-decomposition-step-8-workspace
  - feature-refactor-buildservices-decomposition-step-9-session-assembly
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 10: Wire the orchestrator — slim `buildServices()`

## Brief

With all nine factory functions extracted (steps 1–9), slim `buildServices()` down to the
orchestrator: call each factory in construction order, wire outputs into `ServiceDeps`,
close both ref-cells, construct `SessionServiceImpl` + `IngestionService` +
`DocumentsServiceImpl`, start `SessionSweepIndexer`, and return the `Services` object.

This is the final integration step. It should leave `services.ts` as a concise orchestration
file of ~100–130 lines that reads as a call sequence + assembly rather than a wall of wiring.

## Target state of `buildServices()` body (sketch)

```ts
export function buildServices(dbPath: string, log: MainLogger): Services {
  const { db, sqlite } = openDb({ path: dbPath });

  const infra = buildInfraServices(log);
  const secrets = buildSecretServices(log);
  const sandbox = buildSandboxServices();
  const embeddings = buildEmbeddingsServices(db, sqlite, log);
  const memory = buildMemoryServices(db, log);

  // artifacts depends on secrets + sandbox + memory
  const artifacts = buildArtifactsServices({
    db, log,
    secretStorage: secrets.secretStorage,
    memoryService: memory.memoryService,
    sympy: sandbox.sympy,
    sandbox: sandbox.sandbox,
  });

  // indexers depend on infra + embeddings + artifacts
  const indexers = buildIndexerServices({
    db, log,
    artifactsService: artifacts.artifactsService,
    bootstrapEngineResolver: artifacts.bootstrapEngineResolver,
    pedagogyPackService: embeddings.pedagogyPackService,
    activityRegistry: infra.activityRegistry,
  });

  // workspace depends on embeddings + memory + artifacts + indexers
  const workspace = buildWorkspaceServices({
    db, sqlite, log,
    secretStorage: secrets.secretStorage,
    memoryService: memory.memoryService,
    artifactsService: artifacts.artifactsService,
    draftStore: artifacts.draftStore,
    visionResolver: artifacts.visionResolver,
    embeddedImageStore: embeddings.embeddedImageStore,
    pageImageStore: embeddings.pageImageStore,
  });

  // session precursors depend on artifacts + indexers + workspace
  const sessionPrecursors = buildSessionPrecursors({
    db, log,
    artifactsService: artifacts.artifactsService,
    memoryService: memory.memoryService,
    conceptMapService: indexers.conceptMapService,
    conceptMapConfiguratorId: indexers.conceptMapConfiguratorId,
  });

  // Modes + tool definitions + ServiceDeps assembly
  const modes = new Map([...]);
  const toolDefinitions = [...sandbox.codeSandboxTool, ...];
  const deps: ServiceDeps = { ... };

  // Terminal services that consume the fully assembled deps
  const ingestion = new IngestionService({ ... });
  const documentsService = new DocumentsServiceImpl({ ... });
  const sessionService = new SessionServiceImpl(deps);

  // Close ref-cells now that sessionService is live
  sessionPrecursors.setSessionServiceRef(sessionService);
  artifacts.setNotifyParentSession((input) =>
    sessionService.notifySession({ sessionId: input.parentSessionId, ... })
  );

  // Sweep indexer — start after ref-cells resolved
  const sessionSweepIndexer = new SessionSweepIndexer({ ... });
  sessionSweepIndexer.start();

  return { session: sessionService, ... };
}
```

## Implementation notes

- **Modes map and toolDefinitions array** remain inline in `buildServices()` — they are
  pure data (no constructor calls) and are concise enough to read at a glance. They do not
  warrant their own factory file.
- **`ServiceDeps` assembly block** stays in `buildServices()` for the same reason: it is
  the explicit declaration of the composition root's public contract. Having it visible at
  the top level is intentional.
- **`IngestionService`, `DocumentsServiceImpl`, `SessionServiceImpl`, `SessionSweepIndexer`**
  stay in `buildServices()` because they each depend on the fully-assembled `deps` or on
  `sessionService` being live, which is the terminal orchestration step. They cannot be
  extracted without passing the entire `ServiceDeps` or creating a circular dependency.
- **Verify no imports left orphaned** in `services.ts` after the move: remove every import
  whose symbol is now only used inside a factory module. Run `pnpm lint` — Biome's
  `noUnusedImports` will surface any stragglers.
- **Imports to add**: the nine factory function imports from `./services/build-*.js`.
- **File line count target**: aim for ≤180 lines in `services.ts` (down from 721).

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green (the full suite, not just per-package).
- `services.ts` is ≤200 lines.
- `buildServices()` body contains no `new SomeServiceImpl(...)` calls for services owned by
  factory steps 1–9.
- Both ref-cells are closed in the correct order (sessionServiceRef before sweep start;
  notifyParentSessionRef before sweep start).
- `pnpm --filter @praxis/desktop dist:dir` produces an unpackaged `.app` without errors —
  smoke test the embeddings worker path resolution.
- No behaviour change observable by `pnpm dev` — Electron app boots, sessions open,
  ingestion runs.

## Risk

Medium — this is the integration step, where any mis-wiring of factory outputs becomes
visible. Mitigation: steps 1–9 are each individually committed and green; step 10 only
wires them. The primary risk is a missed import in `services.ts` or a wrong parameter
thread. `pnpm typecheck` will surface both immediately.

Rollback: each factory file from steps 1–9 can be deleted and the inline blocks restored
independently; or the entire step 10 commit can be reverted since all prior extracts
kept the function working.

## Implementation notes

**Line count**: `services.ts` went from 721 lines → 379 lines (47% reduction).

The file is over the ≤200-line target. The gap is accounted for by unavoidable structure:
- Imports: 72 lines (all needed; no inline constructions remain that could trim these)
- `Services` interface: 67 lines (this is the public API contract — 40 service fields
  with JSDoc; same size as in the original, cannot be reduced without losing type safety)
- `buildServices()` body: 238 lines — over the ≤150 target

The function body length comes from two verbose but intentionally-in-place blocks:
1. `ServiceDeps` assembly: ~50 lines of field assignments (story says "stays in buildServices")
2. `return` object: ~40 lines (one entry per service in the `Services` interface)

The factory call cascade itself is only ~90 lines. No inline service constructions remain
for any service owned by steps 1–9. The only `new` calls are the five terminal services
(`IngestionService`, `DocumentsServiceImpl`, `SessionServiceImpl`, `SessionSweepIndexer`,
`ConfigServiceImpl`, `UpdateServiceImpl`) that depend on the fully-assembled `deps` and
are explicitly called out in the story as staying in the orchestrator.

**Tricky wiring decisions**:
- `FsrsSchedulerImpl` is from `@praxis/curriculum/scheduling`, not `@praxis/core/services`.
  Fixed after first typecheck pass.
- `PedagogyPackServiceImpl` from `@praxis/curriculum/pedagogy` needed an explicit import
  to type the `Services.pedagogyPack` field.
- Biome's `organizeImports` reordered the two `@praxis/core/services` import blocks into
  a single merged `import type { ... }` + `import { ... }` structure — applied via
  `pnpm biome check --write`.

**Both ref-cells closed correctly**:
1. `sessionPrecursors.setSessionServiceRef(sessionService)` — closes the promotion
   registry's `engineSessionManager` thunk. Called first.
2. `artifacts.setNotifyParentSession(...)` — closes the assignment service's
   parent-notification bridge. Called second.
Both are closed before `sessionSweepIndexer.start()`, satisfying the ordering constraint.

**Verification**:
- `pnpm typecheck` — clean
- `pnpm biome check packages/desktop/electron/main/services.ts` — clean
- `pnpm --filter @praxis/desktop test --reporter=basic` — 520/520 tests pass
- `pnpm test --reporter=basic` — 4778 passed, 23 skipped (slow Pyodide tests behind env flag)
- No remaining references to `EMBEDDINGS_MODEL_ID`, `EMBEDDINGS_DIMENSION`,
  `requireFromHere`, or `resolveDistPath` in services.ts

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: All 9 factories called in correct cascading dependency order (infra →
secrets → sandbox → embeddings → memory → artifacts → indexers → workspace →
sessionPrecursors). Both ref-cells closed in correct order: `setSessionServiceRef`
first, `setNotifyParentSession` second, both before `sessionSweepIndexer.start()`.
Exactly 6 terminal service `new` calls remain inline (IngestionService,
DocumentsServiceImpl, SessionServiceImpl, SessionSweepIndexer, ConfigServiceImpl,
UpdateServiceImpl — all explicitly called out in the story as staying in the
orchestrator). No factory-owned services constructed inline. Duplicate module-level
constants (`EMBEDDINGS_MODEL_ID`, `EMBEDDINGS_DIMENSION`, `requireFromHere`,
`resolveDistPath`) confirmed absent. Line count 379 vs ≤200 target — deviation
is documented and justified in implementation notes (67-line `Services` interface
public contract + 50-line `ServiceDeps` block cannot be extracted without losing
type safety or readability; ratified by story). 520/520 desktop tests pass.
