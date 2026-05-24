---
id: feature-refactor-buildservices-decomposition-step-10-wire
kind: story
stage: implementing
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
