---
id: gate-tests-write-engine-config-empty-api-key
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

# Empty-apiKey write path is not tested

## Priority
Medium

## Spec reference
Item: `epic-v1-security-hardening-encrypt-api-key` (Unit 4)
Acceptance criterion: "`apiKey === ''` is treated as no-apiKey (line 143) — handles the UI clearing the field, in addition to `undefined`." (Review notes.)

## Gap type
Boundary / equivalence partition — branch exists in implementation but is not directly tested.

## Suggested test
```ts
// packages/core/src/__tests__/engine-config.test.ts
it("writeEngineConfig with apiKey: '' (empty string) does not persist either field — UI clear path", () => {
  writeEngineConfig(client, inMemorySecretStorage(), { engineId: "claude-code", apiKey: "" });
  const stored = readStoredRow(client);
  expect(stored?.apiKey).toBeUndefined();
  expect(stored?.apiKeyEncrypted).toBeUndefined();
});
```

## Test location (suggested)
`packages/core/src/__tests__/engine-config.test.ts`

## Implementation notes

Added two tests inside the `"encrypt/decrypt round-trip — apiKey at rest"` describe block in `packages/core/src/__tests__/engine-config.test.ts`:

1. **`writeEngineConfig with apiKey: '' does not persist either key field — UI clear path`** — fresh write with empty string; asserts both `apiKey` and `apiKeyEncrypted` absent from the raw stored row.

2. **`writeEngineConfig with apiKey: '' clears a previously stored encrypted key`** — writes a real key first (verifying it lands as `apiKeyEncrypted`), then overwrites with `apiKey: ""`; asserts both key fields absent from the row, and `readEngineConfig` returns `apiKey: undefined`.

Implementation at `engine-config.ts:140` confirmed: `if (apiKey === undefined || apiKey === "")` — the spec claim is accurate, no design flaw found. All 33 tests green.
