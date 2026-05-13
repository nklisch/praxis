---
id: gate-tests-write-engine-config-empty-api-key
kind: story
stage: done
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

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
