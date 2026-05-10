# Pattern: ServiceDeps Dependency Injection

`ServiceDeps` is the single DI container holding all cross-cutting dependencies for the service layer. It's constructed once in `buildServices()` (desktop host) and passed to `SessionServiceImpl` + `ConfigServiceImpl`. Tests inject fakes via the optional `engineFactory` field.

## Rationale

A single struct instead of parameter telescoping. Services can access `db`, `log`, `modes`, `toolDefinitions`, and `toolServices` through the same reference. The `engineFactory` escape hatch lets tests inject `FakeEngine` without mocking the entire engine module.

## Examples

### Example 1: `ServiceDeps` interface — complete shape
**File**: `packages/core/src/services/types.ts:36`
```typescript
export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /**
   * Home for ALL injected tool services — every service a tool handler touches
   * lives here (22 fields as of Phase 19). Key entries include:
   *   sympy, sandbox, vectorStore, ftsStore, embeddings, documents,
   *   artifacts, bootstrap, courseState, memory, assignments, packs,
   *   pedagogyPack, lock, authoring, notes, flashcards, fsrsScheduler,
   *   sketches, conceptMaps, courseDocuments, engineResolver,
   *   bootstrapConfigResolver? (optional), quickCheck? (optional)
   * — see types.ts for the full set; adding a new tool service = add here.
   */
  toolServices: {
    sympy: SymPyService;
    sandbox: CodeSandbox;
    vectorStore: VectorStore;
    // ... (other fields elided; see types.ts:45 for the full 22-field struct)
    engineResolver: () => Engine;
  };
  /** Phase 7: optional indexer orchestrator for post-turn memory indexing. */
  indexerOrchestrator?: IndexerOrchestrator;
  /** Test injection seam — omit in production to use createEngine() from @praxis/engines. */
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
  /** Phase 11: required lock service for configure-mode session guard. */
  lockService: LockService;
  /** Phase 11: optional activity registry for the activity rail. */
  activity?: ActivityRegistry;
}
```

### Example 2: `buildServices` — canonical production construction
**File**: `packages/desktop/electron/main/services.ts`
```typescript
export function buildServices(dbPath: string, log: MainLogger): Services {
  const { db } = openDb({ path: dbPath });
  const activityRegistry = new ActivityRegistryImpl({ log });
  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const sympy = new PyodideSymPyService(pyodide);
  // QuickJS WASM replaces isolated-vm for JavaScript. No native binding.
  const sandbox = new CodeSandboxImpl({
    adapters: [new QuickJsLanguageSandbox(), new PyodideLanguageSandbox(pyodide)],
  });
  const codeSandboxTool = createCodeSandboxTool(sandbox);

  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([[teachMode.id, teachMode], /* ... all modes ... */]),
    toolDefinitions: [gradeMathTool, codeSandboxTool, /* ... */],
    toolServices: { sympy, sandbox, /* ... other services ... */ },
    activity: activityRegistry,
    // engineFactory omitted — defaults to createEngine() from @praxis/engines
  };
  const sessionService = new SessionServiceImpl(deps);
  return { session: sessionService, config: new ConfigServiceImpl(deps), activity: activityRegistry, /* ... */ };
}
```

### Example 3: Test injection with `FakeEngine`
**File**: `tests/multi-turn.test.ts`
```typescript
const engine = new RecordingFakeEngine();
const deps: ServiceDeps = {
  db, log: noopLogger(),
  modes: new Map([[teachMode.id, teachMode]]),
  toolDefinitions: [],
  toolServices: {
    sympy: { checkSolution: vi.fn(), solveEquation: vi.fn(), ... } as SymPyService,
    sandbox: { run: vi.fn() } as CodeSandbox,
  },
  engineFactory: () => engine,  // inject fake engine — no real SDK calls
};
const svc = new SessionServiceImpl(deps);
```

## When to Use

- Any new service that needs db/log/modes/tools follows this pattern — add to `ServiceDeps` if it's a cross-cutting concern, and populate in `buildServices`
- Tests that need to isolate engine behavior: supply `engineFactory: () => new FakeEngine()` instead of mocking the entire `@praxis/engines` module

## When NOT to Use

- Don't add per-session state to `ServiceDeps` — it's a construction-time struct; per-session state belongs in the service's instance (e.g., `SessionServiceImpl.active` map)

## Common Violations

- Adding a new service field without updating all test `ServiceDeps` literals — TypeScript will catch this if `toolServices` remains required; if new fields are optional they may silently get `undefined`
- Putting business logic in `buildServices` — it's a factory; complex initialization should be in the service class constructor or a helper
