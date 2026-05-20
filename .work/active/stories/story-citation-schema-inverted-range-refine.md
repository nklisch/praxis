---
id: story-citation-schema-inverted-range-refine
kind: story
stage: done
tags: [security, testing]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# `recordCitation` schema has the same inverted-range validation gap as `spawnFromPassage` did

## Brief
Surfaced during implementation of
`gate-tests-spawn-from-passage-inverted-range`. The `recordCitation` schema
in `packages/desktop/electron/main/citations-channel.ts:17-24` only validates
`int().nonnegative()` on `startOffset` and `endOffset` — no refine for
`endOffset >= startOffset`. The existing test at
`citations-channel-envelope.test.ts:161` only covers the "negative
startOffset" case (the `nonnegative()` constraint), never inverted ranges.

Add the same `.refine(r => r.endOffset >= r.startOffset, ...)` to
`recordSchema` and a corresponding test in
`citations-channel-envelope.test.ts`. Small follow-up; symmetry with the
spawn-from-passage fix.

## Acceptance
- `recordSchema` rejects payloads where `endOffset < startOffset` with a
  clear validation error
- New test in `citations-channel-envelope.test.ts` asserts the rejection
- Boundary case `endOffset === startOffset` is accepted (zero-length range)

## Implementation Notes

**Files changed:**
- `packages/desktop/electron/main/citations-channel.ts` — added `.refine()` to `recordSchema`
- `packages/desktop/electron/main/__tests__/citations-channel-envelope.test.ts` — added 2 new tests

**Refine added** (symmetrical with `spawnFromPassage` in `session-channel.ts:125-127`):
```ts
.refine((r) => r.endOffset >= r.startOffset, {
  message: "endOffset must be >= startOffset",
})
```
Refine message (verbatim): `"endOffset must be >= startOffset"`

**Tests added:**
1. `"returns VALIDATION_FAILED when endOffset < startOffset (inverted range)"` — payload `{ startOffset: 50, endOffset: 10 }` → `{ ok: false, error: { code: "VALIDATION_FAILED" } }`
2. `"accepts endOffset === startOffset (zero-length range is valid)"` — payload `{ startOffset: 20, endOffset: 20 }` → `{ ok: true }`

**Verification:**
- Targeted: `pnpm vitest run packages/desktop/electron/main/__tests__/citations-channel-envelope.test.ts` — 14/14 passed
- Full suite: `pnpm test` — 4534 passed, 23 skipped (slow-test-gated), 0 failed
- `pnpm typecheck` — pre-existing error in `session-service.ts` (IndexerOrchestrator optional vs required) unrelated to this change; confirmed present on main before this story
- `pnpm lint` on changed files: 0 errors; workspace-wide pre-existing errors unchanged

## Review (2026-05-19)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Schema `.refine()` is on the object level — runs after object validation passes — and uses the verbatim message from the `spawnFromPassage` precedent ("endOffset must be >= startOffset"). Two tests cover the acceptance criteria precisely (inverted rejected, zero-length accepted). Symmetry across the two channels is achieved.
