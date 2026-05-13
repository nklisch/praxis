---
id: epic-test-coverage-adversarial-pass-state-and-config-edges
kind: feature
stage: drafting
tags: [testing]
parent: epic-test-coverage-adversarial-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# State-machine and config persistence adversarial coverage

## Brief

Three gate-tests findings cover runtime state and config persistence
edge cases that the existing suite touches at the happy-path level but
doesn't exercise adversarially. The `cancel()` operation is documented
as a no-op when not streaming, but only the `cancel-before-send` state
has a test — `cancel-after-final-arrives`, double-cancel, and
`cancel-during-loadHistory` are all reachable in practice and
unverified. `SqliteDraftStore.save()` is documented as last-writer-
wins under rapid same-tick contention, but the race window isn't
exercised. The engine-config `engineId`-rename round-trip is verified
for the "has apiKey + available safeStorage" path but not for the
"no apiKey + unavailable safeStorage" combination — a regression that
strips engineId on that path would not be caught.

This feature bundles all three because they share two scaffold needs:
deterministic timing for state transitions (vitest fake timers vs.
microtasks) and round-trip assertions on persistence after a contentious
write. Designing them together avoids three parallel "how do we
deterministically order these awaits" debates.

## Epic context

- Parent epic: `epic-test-coverage-adversarial-pass`
- Position in epic: independent. Parallelizable with the other two
  features.

## Scope absorbed from backlog

- `gate-tests-cancel-idempotency-after-final` — `cancel()` no-op
  contract across all hook states, including after-final, double-cancel,
  and during-loadHistory.
- `gate-tests-draft-store-rapid-save-ordering` — single-process rapid
  back-to-back `save()` ordering preserves last-written state.
- `gate-tests-engine-id-rename-no-key-unavailable-storage` — engineId
  rename round-trips correctly even with no apiKey and unavailable
  safeStorage.

## Foundation references

- `docs/ARCHITECTURE.md` — session cancellation contract, draft store
  contract, engine config persistence
- `CLAUDE.md` — `temp-db-test-helper` pattern (`useTempDb()`)

## Anchors (current implementation)

- Streamed-send hook test —
  `packages/ui/src/__tests__/use-streamed-send.test.tsx:985` (existing
  `cancel-before-send` test; new states go alongside)
- Draft store test — `packages/core/src/__tests__/draft-store.test.ts`
- Engine config test — `packages/core/src/__tests__/engine-config.test.ts`
- Draft store implementation —
  `packages/core/src/draft-store/sqlite-draft-store.ts` (or equivalent)
- Engine config encryption path —
  `packages/core/src/config/engine-config.ts`
