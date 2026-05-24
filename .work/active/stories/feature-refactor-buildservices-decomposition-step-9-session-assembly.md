---
id: feature-refactor-buildservices-decomposition-step-9-session-assembly
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-buildservices-decomposition
depends_on:
  - feature-refactor-buildservices-decomposition-step-6-artifacts
  - feature-refactor-buildservices-decomposition-step-7-indexers
  - feature-refactor-buildservices-decomposition-step-8-workspace
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 9: Extract `buildSessionPrecursors()`

## Brief

Extract the services that must be constructed before `SessionServiceImpl` — the
session promotion registry (with its ref-cell), the prompt customization service, and
the authoring service — into
`packages/desktop/electron/main/services/build-session-precursors.ts`.

The ref-cell pattern for `sessionPromotionRegistry` (lines 529–541) mirrors the
`notifyParentSessionRef` cell in step 6. The factory returns a setter so the orchestrator
can close the ref after `SessionServiceImpl` is live.

## Services covered

From `packages/desktop/electron/main/services.ts` lines 529–558:

```ts
let sessionServiceRef: SessionServiceImpl | undefined;  // line 529
const sessionPromotionRegistry = new SessionPromotionRegistryImpl({ // line 530
  ...,
  engineSessionManager: () => {
    if (!sessionServiceRef) throw new Error(...);
    return sessionServiceRef.engineManager;
  },
});
const promptCustomizationService = new PromptCustomizationServiceImpl({ db }); // line 544
const authoringService = new AuthoringServiceImpl({ ... });                     // lines 548–558
```

## Target state

New file `packages/desktop/electron/main/services/build-session-precursors.ts`.

Factory signature:

```ts
export function buildSessionPrecursors(deps: {
  db: BetterSQLite3Database;
  log: MainLogger;
  artifactsService: ArtifactsServiceImpl;
  memoryService: MemoryServiceImpl;
  conceptMapService: ConceptMapServiceImpl;
  conceptMapConfiguratorId: () => ConfiguratorId;
  promptCustomization: PromptCustomizationServiceImpl;  // built inside if not split further
}): SessionPrecursorServices
```

Returns:

```ts
export interface SessionPrecursorServices {
  sessionPromotionRegistry: SessionPromotionRegistryImpl;
  /** Call after SessionServiceImpl is constructed to close the ref-cell. */
  setSessionServiceRef: (svc: SessionServiceImpl) => void;
  promptCustomizationService: PromptCustomizationServiceImpl;
  authoringService: AuthoringServiceImpl;
}
```

`PromptCustomizationServiceImpl` is constructed inside this factory (it has a single `db`
dep). `AuthoringServiceImpl` depends on `artifactsService`, `memoryService`,
`conceptMapService`, `conceptMapConfiguratorId`, and `promptCustomizationService` — all
in-scope from factory parameters or from local construction.

The orchestrator (`buildServices()`) calls `setSessionServiceRef(sessionService)` after
`sessionService` is live, replacing the current direct `sessionServiceRef = sessionService`.

## Implementation notes

- The `sessionServiceRef` `let` is declared inside the factory body as a module-internal
  variable (like the `notifyParentSessionRef` pattern in step 6).
- `setSessionServiceRef` is a closure that writes `sessionServiceRef`.
- `authoringService` uses `studentId: () => brandId<"StudentId">(getOrCreateDefaultStudentId(db))` — `db` is a factory parameter, so this closes over it correctly.
- `AuthoringServiceImpl` constructor signature should be imported with `import type` or
  concrete as needed; check for `verbatimModuleSyntax` compliance.

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `services.ts` no longer directly instantiates `SessionPromotionRegistryImpl`,
  `PromptCustomizationServiceImpl`, or `AuthoringServiceImpl`.
- `sessionServiceRef` let is not accessible outside the factory module.
- `setSessionServiceRef` is called by the orchestrator after `SessionServiceImpl` is live,
  before `sessionSweepIndexer.start()`.

## Risk

Medium — contains the session-promotion ref-cell, a subtlety identical to the
`notifyParentSessionRef` in step 6. The setter pattern is well-established by that step.
Rollback: revert the new file and restore the inline blocks in `buildServices()`.
