---
id: gate-tests-write-engine-config-empty-api-key
kind: story
stage: drafting
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
