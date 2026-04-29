# Pattern: ServiceDeps Dependency Injection

`ServiceDeps` is the single DI container holding all cross-cutting dependencies for the service layer. It's constructed once in `buildServices()` (desktop host) and passed to `SessionServiceImpl` + `ConfigServiceImpl`. Tests inject fakes via the optional `engineFactory` field.

## Rationale

A single struct instead of parameter telescoping. Services can access `db`, `log`, `modes`, `toolDefinitions`, and `toolServices` through the same reference. The `engineFactory` escape hatch lets tests inject `FakeEngine` without mocking the entire engine module.

## Examples

### Example 1: `ServiceDeps` interface — complete shape
**File**: `packages/core/src/services/types.ts:13`
```typescript
export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  toolServices: { sympy: SymPyService; sandbox: CodeSandbox };
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;  // test injection seam
}
```

### Example 2: `buildServices` — canonical production construction
**File**: `packages/desktop/electron/main/services.ts`
```typescript
export function buildServices(dbPath: string): Services {
  const { db } = openDb({ path: dbPath });
  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const jsHost = new IsolatedVmHost();
  const sympy = new PyodideSymPyService(pyodide);
  const sandbox = new LocalCodeSandbox(jsHost, pyodide);

  const deps: ServiceDeps = {
    db,
    log: consoleLogger,
    modes: new Map([[teachMode.id, teachMode]]),
    toolDefinitions: [gradeMathTool, codeSandboxTool],
    toolServices: { sympy, sandbox },
    // engineFactory omitted — defaults to createEngine() from @praxis/engines
  };
  return { session: new SessionServiceImpl(deps), config: new ConfigServiceImpl(deps), pyodide };
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
