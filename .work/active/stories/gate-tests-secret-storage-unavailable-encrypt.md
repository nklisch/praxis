---
id: gate-tests-secret-storage-unavailable-encrypt
kind: story
stage: implementing
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
