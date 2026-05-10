# Lazy Resolver Thunk

Cross-service dependencies that need late binding are passed as zero-arg (or single-arg) thunks of the form `() => T` or `(id: string) => T | null`, called per-use rather than captured at construction. Code comments throughout the codebase recognize and refer to this as "the same lazy-resolver pattern".

## Rationale

Two reasons keep recurring. First, the active engine config is user-tunable and can change at any moment from the UI; capturing an `Engine` instance at service construction would leak a stale engine after a swap. Resolving fresh per call (`engineResolver: () => Engine`) makes swaps take effect on the next operation without a service restart. Second, the dep graph has acyclic ordering constraints — `BootstrapServiceImpl` needs an Engine, but the engine factory needs a config that lives in the DB; threading a resolver thunk lets both be wired at the same level of `buildServices` without circular references. The same shape is used for course lookup (`sessionCourseId: (id) => string | null`) — it lets indexers stay decoupled from `SessionService` while still being able to attribute a session to a course.

## Examples

### Example 1: Bootstrap engine resolver — wired in `buildServices`
**File**: `packages/desktop/electron/main/services.ts:252`
```typescript
// Phase 6: Bootstrap engine resolver — same pattern as visionResolver above.
// Looks up the active engine at call time so engine swaps reflect immediately.
const bootstrapEngineResolver = () => {
  const engineConfig = readEngineConfig(db);
  return createEngine({ config: engineConfig, deps: { log } });
};

const bootstrapService = new BootstrapServiceImpl({
  db,
  log,
  engineResolver: bootstrapEngineResolver,
  courseDocuments: courseDocumentsService,
});
```

### Example 2: AffectiveIndexer dep contract
**File**: `packages/core/src/services/indexers/affective-indexer.ts:45`
```typescript
export interface AffectiveIndexerDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves the active engine for the one-shot inference call. */
  engineResolver: () => Engine;
}
// Inside run(): const events = runOneShot(deps.engineResolver(), { ... }, userMessage);
```

### Example 3: Bootstrap config resolver + session→course thunk
**File**: `packages/core/src/services/types.ts:88`
```typescript
engineResolver: () => Engine;
bootstrapConfigResolver?: () => { maxSteps: number };
// And in indexer deps:
sessionCourseId: (sessionId: string) => string | null;
```

`bootstrapConfigResolver` is wired in `services.ts:523` as `() => readBootstrapConfig(db)` — read at call time so a UI tweak applies to the very next exploration.

## When to Use

- Dep is user-tunable and may change at runtime; a captured instance would go stale (engine config, vision config, bootstrap maxSteps)
- Dep crosses an acyclic-ordering edge — the consumer needs to be constructed before the producer, but only *uses* the producer on demand
- Dep is "look up by id" and the alternative would be passing the entire owning service for one method (e.g. an indexer takes `sessionCourseId` instead of the whole `SessionService`)

## When NOT to Use

- Static deps that never change after construction — pass the value directly (`db`, `log`, `pedagogyPack`)
- Hot paths where the resolver does real work each call — resolve once at the top of the operation and reuse the result

## Common Violations

- Calling the resolver in the constructor and storing the result — defeats the purpose; the captured instance is now stale
- Using a thunk where a static dep would do — adds an unnecessary indirection layer for no swap-ability gain
