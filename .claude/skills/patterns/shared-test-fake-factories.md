# Pattern: Shared test-fake factories

`tests/helpers/mocks.ts` holds factory functions — `inMemorySecretStorage()`, `noopLogger()`, `noopLockService()`, `noopCourseDocuments()`, `recordingLogger()` — each returning a port interface satisfied with no-op or in-memory behavior. Tests import these instead of constructing literal mock objects inline. Negative-path variants (e.g. `unavailableSecretStorage()`) live alongside the default so the fakes are the single source of truth for the contract.

## Rationale

Praxis has ~22 ports in `ServiceDeps`. Without a shared fakes module, every test would either construct a literal mock with `vi.fn()`s or import the production implementation. The former drifts as the port grows (a new method on `LockService` silently leaves stale tests unaffected — they don't call it); the latter forces real DBs and Electron globals into pure-unit tests. The factories collapse this to one import line per port. Their location at the repo root (`tests/helpers/mocks.ts`) means any package can import them via a relative path. With 137+ call sites across the test suite, the factory file is the canonical contract surface for port test doubles.

## Examples

### Example 1: Two shapes per port — default + negative-path variant

**File**: `tests/helpers/mocks.ts:10`
```typescript
export function inMemorySecretStorage(): SecretStorage {
  return {
    isAvailable: () => true,
    encrypt: (plaintext) => Buffer.from(plaintext, "utf8").toString("base64"),
    decrypt: (b64) => {
      try { return Buffer.from(b64, "base64").toString("utf8"); }
      catch { return null; }
    },
  };
}

export function unavailableSecretStorage(): SecretStorage {
  return {
    isAvailable: () => false,
    encrypt: () => { throw new SecretStorageError("test: safeStorage unavailable", "unavailable"); },
    decrypt: () => null,
  };
}
```

### Example 2: No-op factories for ports the test doesn't exercise

**File**: `tests/helpers/mocks.ts:59`
```typescript
export function noopLockService(): LockService {
  return {
    isSet: async () => false,
    isUnlocked: async () => true,
    setLockCode: async () => {},
    unlock: async () => ({ ok: true }),
    lock: async () => {},
    clearLock: async () => {},
  };
}

export function noopCourseDocuments(): CourseDocumentsService { /* … */ }
```

### Example 3: Recording variant for assertion-style tests

**File**: `tests/helpers/mocks.ts:91`
```typescript
export function recordingLogger(): Logger & { records: Array<{ level, message, fields?, bindings? }> } {
  const records = [];
  const make = (bindings) => ({
    debug: (m, f) => records.push({ level: "debug", message: m, /* … */ }),
    info: /* … */,
    child: (b) => make({ ...bindings, ...b }),
  });
  return Object.assign(make({}), { records });
}
```

Used at `packages/core/src/services/__tests__/session-service.prompt-customization.test.ts:144` and 50+ other sites.

## When to Use

- New port added to `ServiceDeps` that 3+ test files will need to satisfy. Add a `noopX()` or `inMemoryX()` factory in `tests/helpers/mocks.ts`, not in each test file
- Test needs a deliberately broken implementation (decrypt failure, encryption unavailable, lock always set) — add a named variant alongside the default
- Test wants to assert on call history (logger output, dispatch order) — use a recording-style factory like `recordingLogger`

## When NOT to Use

- Single-use mocks where the contract is irrelevant to other tests — inline `vi.fn()` is fine
- DB-touching tests — use `useTempDb()` + the real service, not a fake. The temp-db pattern handles isolation more accurately
- Production code path needs the implementation — implement under the production package, not in `tests/helpers/`

## Common Violations

- Inline literal mocks (`{ isAvailable: () => true, encrypt: vi.fn(), decrypt: vi.fn() }`) when the canonical fake exists — the literal silently goes stale when the port grows
- Putting the factory in a per-package test helper (e.g. `packages/core/src/__tests__/helpers/`) when it's port-level. Port-level fakes belong at repo root so packages can share them
- Forgetting the variant: a test that needs the failure path inlining its own broken mock instead of adding `unavailableX()` next to `inMemoryX()`
