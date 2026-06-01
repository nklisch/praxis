# Pattern: Service-Composition Ref-Cell Bridge

When two services have a mutual dependency that can't be resolved at construction time (A is built before B, but A calls into B at runtime), the builder declares a module-local `let xxxRef: T | undefined`, exposes a `setXxxRef(fn)` setter as part of its returned Services, closes over the ref in a thunk passed into A's deps, and the orchestrator calls `setXxxRef(b)` after B is constructed.

## Rationale

The strict service-construction order (memory → assignment → artifacts → … → session) plus genuine bidirectional needs (`AssignmentServiceImpl` notifies a parent `SessionService` when a child assignment submits; `SessionPromotionRegistry` needs to discard engine sessions via `SessionService`) requires a deferred binding. Declaring the ref inside the builder's body keeps the binding lexically scoped (no module globals); exposing a setter rather than a `setRef` everywhere avoids leaking the imperative wiring step to every caller. The thunk shape (`(input) => ref?.(input) ?? Promise.resolve()`) means partial wiring is safe — if A calls the bridge before B is constructed, the call no-ops cleanly.

## Examples

### Example 1: notifyParentSession ref-cell

**File**: `packages/desktop/electron/main/services/build-artifacts-services.ts:130`

```ts
let notifyParentSessionRef: NotifyParentSessionFn | undefined;

const setNotifyParentSession = (fn: NotifyParentSessionFn): void => {
  notifyParentSessionRef = fn;
};

const assignmentService = new AssignmentServiceImpl({
  /* ... */
  notifyParentSession: (input) => notifyParentSessionRef?.(input) ?? Promise.resolve(),
});

return { /* ... */, setNotifyParentSession };
```

### Example 2: sessionService ref-cell for promotion registry

**File**: `packages/desktop/electron/main/services/build-session-precursors.ts:73`

```ts
let sessionServiceRef: SessionServiceImpl | undefined;

const setSessionServiceRef = (svc: SessionServiceImpl): void => {
  sessionServiceRef = svc;
};

const sessionPromotionRegistry = new SessionPromotionRegistryImpl({
  db, log,
  engineSessionManager: () => {
    if (!sessionServiceRef) throw new Error("...not yet initialised");
    return sessionServiceRef.engineManager;
  },
});

return { sessionPromotionRegistry, setSessionServiceRef, /* ... */ };
```

### Example 3: orchestrator closes both ref-cells

**File**: `packages/desktop/electron/main/services.ts:319`

```ts
const sessionService = new SessionServiceImpl(deps);

// Close both ref-cells now that sessionService is live
sessionPrecursors.setSessionServiceRef(sessionService);
artifacts.setNotifyParentSession((input) =>
  sessionService.notifySession({ /* ... */ })
);
```

## When to Use

- Two services have a runtime call dependency that cycles (A→B and B→A in different code paths).
- Construction order is fixed by data-flow constraints (memory must exist before mastery, etc.).
- The cross-service call only happens after `buildServices()` returns (e.g. on a future user action, not at startup).

## When NOT to Use

- Both services can be constructed in any order — pass the dep directly through the constructor.
- The dependency is read-only configuration — use `lazy-resolver-thunk` instead (a `() => T` getter).
- The "missing" period of partial wiring is unsafe (e.g. the bridge gets called during construction before the orchestrator closes the ref) — restructure the dependency chain.

## Common Violations

- Using a module-level `let` (file-scope, not inside the builder) — leaks state into Vitest tests that re-import the module.
- Throwing rather than no-oping in the thunk when the ref is undefined and the call is non-critical — `notifyParentSession` is fire-and-forget; throwing would crash assignment submission for a UI nicety.
- Forgetting to call the setter — the call site near `new SessionServiceImpl(...)` MUST close every ref-cell that depends on it.
