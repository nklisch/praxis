---
id: epic-test-coverage-adversarial-pass-state-and-config-edges-engineid-rename-unavailable-storage
kind: story
stage: done
tags: [testing]
parent: epic-test-coverage-adversarial-pass-state-and-config-edges
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# engineId rename round-trip — no apiKey + unavailable safeStorage

## Scope

Pin the `engineId` rename round-trip in
`packages/core/src/__tests__/engine-config.test.ts` on the
"no apiKey + unavailable safeStorage" path. The existing suite
covers:

- `writeEngineConfig with unavailable safeStorage + apiKey throws` (line 239)
- `writeEngineConfig with unavailable safeStorage and no apiKey succeeds` (line 249)

But no test verifies that a **second** write changing `engineId`
on that same unavailable-storage + no-key path round-trips
correctly. A regression that strips `engineId` on that branch
would not be caught.

## Anchors

- Test file: `packages/core/src/__tests__/engine-config.test.ts`
- Implementation: `packages/core/src/config/engine-config.ts`
  (`writeEngineConfig` at line 127, `readEngineConfig` at 41)
- Helper: `unavailableSecretStorage()` at
  `tests/helpers/mocks.ts:29`

## Pattern anchors

- `temp-db-test-helper` — reuse `useTempDb()` already at line 66 of
  the test file's encrypt/decrypt describe block.
- `shared-test-fake-factories` — `unavailableSecretStorage` and
  `inMemorySecretStorage` already imported at line 5-7.

## Implementation

Add one `it(...)` block at the end of the existing
`describe("encrypt/decrypt round-trip — apiKey at rest", ...)`
block. Body is fully specified in the parent feature's Unit 3
section.

Key points:
- First write: `{ engineId: "claude-code" }` + unavailable storage
  (no apiKey, so write succeeds).
- Second write: `{ engineId: "codex" }` + same storage.
- Read back: `engineId === "codex"`, `apiKey` undefined.
- Stored row inspection: neither `apiKey` nor `apiKeyEncrypted` present.

## Acceptance criteria

- [ ] One new `it(...)` block exists with this exact name:
  `"engineId update with no apiKey + unavailable storage round-trips correctly (no fields lost)"`
- [ ] One-line `// Spec:` source comment pinning intent.
- [ ] Test passes under
  `pnpm --filter @praxis/core vitest run src/__tests__/engine-config.test.ts`.
- [ ] `pnpm typecheck && pnpm lint` green from repo root.
- [ ] No changes to `config/engine-config.ts`.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: Stored-row inspection asserts both `apiKey` and `apiKeyEncrypted` are absent — load-bearing for the security property.

**Notes**: All 34 tests pass. Implementation matches the spec exactly.
