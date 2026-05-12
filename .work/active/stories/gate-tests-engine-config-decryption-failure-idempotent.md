---
id: gate-tests-engine-config-decryption-failure-idempotent
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

# Decryption-failure on `apiKey` is not asserted idempotent across multiple reads

## Priority
Medium

## Spec reference
Item: `epic-v1-security-hardening-encrypt-api-key` (Unit 4)
Acceptance criterion: "Decryption failure: returns config with `apiKey === undefined` and logs a warn message; does NOT crash, does NOT clear the stored blob."

## Gap type
Adversarial-spec-silent / boundary — existing test covers blob preservation in one call. Re-reading after the failure isn't covered (does the blob still survive across reads with no migration write-loop?).

## Suggested test
```ts
// packages/core/src/__tests__/engine-config.test.ts
it("decryption-failure is idempotent across multiple reads — blob is preserved every time", () => {
  // Seed corrupt apiKeyEncrypted row.
  // First read with always-null SecretStorage → apiKey undefined, blob preserved.
  // Second read → still apiKey undefined, blob still there, no new updatedAt
  //   (i.e., no write happened; verify by capturing updatedAt before/after).
});
```

## Test location (suggested)
`packages/core/src/__tests__/engine-config.test.ts`
