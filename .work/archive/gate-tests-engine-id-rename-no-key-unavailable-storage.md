---
id: gate-tests-engine-id-rename-no-key-unavailable-storage
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-12
updated: 2026-05-17
---

# `engineId` rename with no apiKey + unavailable safeStorage — full round-trip not pinned

## Priority
Low

## Spec reference
Item: `epic-v1-security-hardening-encrypt-api-key` (Unit 4)
Acceptance criterion: "`writeEngineConfig` with no apiKey (engineId-only change): persists successfully regardless of safeStorage availability."

## Gap type
Boundary / read-after-write completeness — existing test checks unavailable+no-key but doesn't lock the engineId-change shape. A regression stripping engineId on the no-key path would not be caught.

## Suggested test
```ts
// packages/core/src/__tests__/engine-config.test.ts
it("engineId update with no apiKey + unavailable storage round-trips correctly (no fields lost)", () => {
  // Pre-seed config with engineId: codex, no apiKey.
  // writeEngineConfig with engineId: direct.anthropic, model: claude-sonnet-4-5, NO apiKey.
  // readEngineConfig must reflect the new engineId AND model.
});
```

## Test location (suggested)
`packages/core/src/__tests__/engine-config.test.ts`

## Implementation notes — Land mode

Test already shipped at the suggested location; orchestrator audit confirmed:

- `packages/core/src/__tests__/engine-config.test.ts:315` — `it("engineId update with no apiKey + unavailable storage round-trips correctly (no fields lost)")` pre-seeds with `engineId: "claude-code"`, then writes `engineId: "codex"` under unavailable safeStorage, and asserts `readEngineConfig` reflects the new id with `apiKey` undefined and no stray plaintext or encrypted blob in the stored row.

Gate is fully closed — advance to review.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode closure. Citation verified — the test at line 315 of `engine-config.test.ts` exercises the engineId rename round-trip under `unavailableSecretStorage()`, asserts the read-back engineId matches, and crucially also asserts the stored row carries neither plaintext `apiKey` nor encrypted blob.
