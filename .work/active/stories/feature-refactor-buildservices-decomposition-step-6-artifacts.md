---
id: feature-refactor-buildservices-decomposition-step-6-artifacts
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-buildservices-decomposition
depends_on:
  - feature-refactor-buildservices-decomposition-step-2-secrets
  - feature-refactor-buildservices-decomposition-step-3-sandbox
  - feature-refactor-buildservices-decomposition-step-5-memory
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 6: Extract `buildArtifactsServices()`

## Brief

Extract the artifact-domain services — document scopes, citations, draft store,
course-create service, engine resolvers, assignment service (with its ref-cell),
and artifacts service — into
`packages/desktop/electron/main/services/build-artifacts-services.ts`.

This is the most entangled extract: it covers the three engine-resolver closures
(visionResolver, bootstrapEngineResolver, assignmentEngineResolver), the
`notifyParentSessionRef` mutable ref-cell (Phase 16 bridge pattern), and the
critical construction ordering (memory → assignment → artifacts).

## Services covered

From `packages/desktop/electron/main/services.ts` lines 279–389:

```ts
const visionResolver = () => { ... };         // line 279
const bootstrapEngineResolver = () => { ... }; // line 291
const documentScopesService = new DocumentScopesServiceImpl(...); // line 297
const citationsService = new CitationsServiceImpl(...);            // line 300
const draftStore = new SqliteDraftStore(db);                       // line 303
const bootstrapService = new CourseCreateServiceImpl(...);         // line 306
let notifyParentSessionRef = undefined;                            // line 355
const assignmentService = new AssignmentServiceImpl(...);          // line 363
const artifactsService = new ArtifactsServiceImpl(...);            // line 383
```

Plus the `assignmentEngineResolver` closure at line 343.

## Target state

New file `packages/desktop/electron/main/services/build-artifacts-services.ts`.

The factory accepts:

```ts
export interface ArtifactsServiceDeps {
  db: BetterSQLite3Database;
  sqlite: Database;   // not used directly here but passed through for consistency
  log: MainLogger;
  secretStorage: ElectronSafeStorageAdapter;
  memoryService: MemoryServiceImpl;
  sympy: PyodideSymPyService;
  sandbox: CodeSandboxImpl;
}
```

Returns:

```ts
export interface ArtifactsServices {
  visionResolver: () => VisionCapability | undefined;
  bootstrapEngineResolver: () => Engine;
  documentScopesService: DocumentScopesServiceImpl;
  citationsService: CitationsServiceImpl;
  draftStore: SqliteDraftStore;
  bootstrapService: CourseCreateServiceImpl;
  assignmentService: AssignmentServiceImpl;
  artifactsService: ArtifactsServiceImpl;
  /** Mutable ref-cell — must be wired by the orchestrator after SessionServiceImpl is live. */
  setNotifyParentSession: (fn: NotifyParentSessionFn) => void;
}
```

The `notifyParentSessionRef` cell becomes a module-internal `let` inside the factory;
the factory returns a `setNotifyParentSession` setter. The orchestrator (`buildServices()`)
calls `setNotifyParentSession(...)` after `sessionService` is live, replacing the current
direct assignment `notifyParentSessionRef = ...`.

## Implementation notes

- **Engine resolvers**: all three closures close over `db`, `secretStorage`, and `log`.
  Those are passed as explicit factory parameters — no module-level state.
- **notifyParentSessionRef ref-cell**: keeps the same behaviour; the `let` is declared
  inside the factory body; `setNotifyParentSession` is a closure that writes it.
  The assignment in `buildServices()` after `sessionService` is live becomes:
  ```ts
  setNotifyParentSession((input) =>
    sessionService.notifySession({ sessionId: input.parentSessionId, ... })
  );
  ```
- **`resolveSubmissionMode`** closure (line 373): closes over `db` — stays inside the factory.
- **`readSessionCourseId`** helper (line 315): currently used by both indexers (step 7) and
  the `bootstrapService` construction — this helper actually belongs conceptually to step 7
  (indexers). However it is also referenced nowhere else in the artifacts block. Extract it
  to step 7 and pass `db` there directly; the inline `db.select().from(sessions).where(...).get()`
  logic is simple enough to re-derive or share via a tiny helper module. This story does NOT
  extract `readSessionCourseId` — step 7 owns it.
- **Import `@praxis/engines`**: the engine resolvers call `createEngine(...)` — this is
  correct under the Phase 3 exception (factories live in `packages/desktop/electron/main/`).

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `services.ts` no longer directly instantiates `DocumentScopesServiceImpl`,
  `CitationsServiceImpl`, `SqliteDraftStore`, `CourseCreateServiceImpl`,
  `AssignmentServiceImpl`, or `ArtifactsServiceImpl`.
- Engine resolver closures live exclusively in the new factory.
- `notifyParentSessionRef` cell is internal to the factory; the orchestrator uses
  `setNotifyParentSession` to close the ref.
- Construction ordering preserved: memory → assignment → artifacts (enforced by parameter
  types — `memoryService` and the sandbox are required inputs).

## Risk

Medium — contains the most state (ref-cell, three closures, 5 service constructors).
The ref-cell pattern is unchanged in semantics; only the _setter_ surface changes.
Rollback: revert the new file and restore all inline blocks in `buildServices()`.
