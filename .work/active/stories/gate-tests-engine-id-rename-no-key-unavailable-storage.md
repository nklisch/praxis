---
id: gate-tests-engine-id-rename-no-key-unavailable-storage
kind: story
stage: implementing
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
