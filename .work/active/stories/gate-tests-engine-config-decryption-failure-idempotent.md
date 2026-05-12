---
id: gate-tests-engine-config-decryption-failure-idempotent
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

## Implementation notes

Added `"decryption failure is idempotent across multiple reads — blob is preserved every time"` to the `encrypt/decrypt round-trip — apiKey at rest` describe block in `packages/core/src/__tests__/engine-config.test.ts`.

The test seeds a row with a corrupt `apiKeyEncrypted` blob and a known `seedUpdatedAt` timestamp (5 seconds in the past), then calls `readEngineConfig` twice with a `SecretStorage` whose `decrypt` always returns `null`. It asserts:

- Both reads return `apiKey: undefined`.
- The stored `apiKeyEncrypted` blob is unchanged after each read (byte-equal to the seeded value).
- The `updatedAt` timestamp is unchanged between reads and still equals the seeded value — confirming no DB write fired on either read.

Verified via code inspection: the migration write-back in `readEngineConfig` is gated on `needsMigrationWrite`, which is only set to `true` in the legacy-plaintext branch (`stored?.apiKey` path). The decrypt-failure branch does not set `needsMigrationWrite`, so the write-back is correctly suppressed. The test confirms this at runtime across two sequential reads.

All 31 tests in `engine-config.test.ts` pass. `pnpm typecheck` clean.
