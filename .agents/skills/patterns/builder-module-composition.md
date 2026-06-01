# Pattern: Builder-Module Composition

The desktop service-composition step lives as 9 sibling `build-<domain>-services.ts` modules, each exporting an `<Domain>Services` interface and a `build<Domain>Services(deps)` factory; the orchestrator (`services.ts`) calls them in dependency order and threads outputs as inputs.

## Rationale

A single 600+ line monolithic `buildServices()` function used to wire everything; the decomposition pulled cohesive subsystems into focused builders so each one is testable, has a small explicit input set, and declares its outputs as a typed object. The orchestrator becomes a linear dependency-ordered script of `build*` calls.

## Examples

### Example 1: secrets layer (minimal builder shape)

**File**: `packages/desktop/electron/main/services/build-secret-services.ts:18`

```ts
export interface SecretServices {
  secretStorage: ElectronSafeStorageAdapter;
  claudeAuthService: ClaudeAuthServiceImpl;
}

export function buildSecretServices(log: MainLogger): SecretServices {
  const secretStorage = new ElectronSafeStorageAdapter();
  const claudeAuthService = new ClaudeAuthServiceImpl({ log });
  return { secretStorage, claudeAuthService };
}
```

### Example 2: memory layer (typed deps)

**File**: `packages/desktop/electron/main/services/build-memory-services.ts:9`

```ts
export interface MemoryServices { memoryService: MemoryServiceImpl; }
export function buildMemoryServices(db: PraxisDb, log: MainLogger): MemoryServices {
  const memoryService = new MemoryServiceImpl({ db, log, decayDaysFor: () => 14 });
  return { memoryService };
}
```

### Example 3: artifacts layer (heavy deps object + multiple outputs)

**File**: `packages/desktop/electron/main/services/build-artifacts-services.ts:48`

```ts
export interface ArtifactsServiceDeps {
  db: PraxisDb;
  log: MainLogger;
  secretStorage: ElectronSafeStorageAdapter;
  memoryService: MemoryServiceImpl;
  sympy: PyodideSymPyService;
  sandbox: CodeSandboxImpl;
}
export interface ArtifactsServices { /* ... */ }
export function buildArtifactsServices(deps: ArtifactsServiceDeps): ArtifactsServices {
  /* ... */
}
```

### Example 4: session precursors (exposes ref-cell setter as output)

**File**: `packages/desktop/electron/main/services/build-session-precursors.ts:61`

The builder returns both the constructed services and any `setXxxRef` setters needed by the orchestrator to close cyclic dependencies — see `ref-cell-bridge` for the binding shape.

## When to Use

- A new subsystem of services needs wiring at app startup and has 2+ collaborators.
- The builder's dependencies can be expressed as a finite typed object (a `*Deps` interface).
- The orchestrator can take the returned object and treat its fields as inputs to later builders.

## When NOT to Use

- A single service with no internal collaborators — just instantiate in the orchestrator.
- Cross-builder bridges that need a ref-cell — instead, expose a `setXxxRef` setter from the builder and call it from the orchestrator after the cross-dependency is live (see `ref-cell-bridge`).

## Common Violations

- Returning `void` / mutating an outer `services` object instead of returning a typed Services object — breaks the linear orchestrator chain.
- Reaching into shared state (e.g., reading a module-level singleton) instead of accepting deps via parameter.
- Importing from `./services.ts` (orchestrator) inside a `build-*.ts` (circular) — builders must only know about `@praxis/core/services` and other builders' return types.
- Positional parameters instead of a typed deps object — adding a new dep becomes a call-site change rather than a one-field addition. The current outliers (`buildMemoryServices`, `buildEmbeddingsServices`) should migrate.
