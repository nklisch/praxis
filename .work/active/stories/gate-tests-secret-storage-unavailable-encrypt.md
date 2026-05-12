---
id: gate-tests-secret-storage-unavailable-encrypt
kind: story
stage: review
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `ElectronSafeStorageAdapter.encrypt` does not test the "unavailable" failure mode contract

## Priority
High

## Spec reference
Item: `epic-v1-security-hardening-encrypt-api-key` (Unit 2)
Acceptance criterion: "`encrypt` throws `SecretStorageError` with `code: 'unavailable'` when safeStorage isn't available."

## Gap type
Missing test for error case (boundary)

## Suggested test
```ts
// packages/desktop/electron/main/__tests__/secret-storage.test.ts
it("encrypt throws SecretStorageError with code='unavailable' when isEncryptionAvailable=false", async () => {
  const { safeStorage } = await import("electron");
  (safeStorage as any).isEncryptionAvailable = () => false;
  const adapter = new ElectronSafeStorageAdapter();
  try { adapter.encrypt("anything"); expect.fail("expected throw"); }
  catch (err) {
    expect(err).toBeInstanceOf(SecretStorageError);
    expect((err as SecretStorageError).code).toBe("unavailable");
  }
});

it("decrypt returns null when isEncryptionAvailable=false", async () => { /* … */ });
```

## Test location (suggested)
`packages/desktop/electron/main/__tests__/secret-storage.test.ts`

## Implementation notes

Added a new `describe("ElectronSafeStorageAdapter — safeStorage unavailable", ...)` block in `packages/desktop/electron/main/__tests__/secret-storage.test.ts` containing two tests:

1. **`encrypt` throws `SecretStorageError` with `code='unavailable'`** — uses `vi.spyOn(safeStorage, "isEncryptionAvailable").mockReturnValue(false)` in `beforeEach` to override the module-level mock, then asserts both that `toThrowError(SecretStorageError)` and that `err.code === "unavailable"`.

2. **`decrypt` returns `null` (not throws)** — same `beforeEach` spy, verifies the documented silent-null contract when encryption is unavailable.

`vi.restoreAllMocks()` in `afterEach` resets the spy so the happy-path tests in the outer `describe` block remain unaffected. `SecretStorageError` is imported from `@praxis/core/types` (the canonical definition). All 7 tests pass; typecheck and lint are clean on the changed file.
