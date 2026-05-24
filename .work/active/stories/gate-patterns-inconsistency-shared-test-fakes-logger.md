---
id: gate-patterns-inconsistency-shared-test-fakes-logger
kind: story
stage: review
tags: [refactor, testing]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: patterns
created: 2026-05-23
updated: 2026-05-24
---

# Channel-envelope tests inline `makeFakeLogger()` instead of using shared `makeSpyLogger`

## Existing pattern
`shared-test-fake-factories` — port test doubles live as factory
functions in `tests/helpers/mocks.ts`; tests import these instead of
inlining literal mocks.

## Nature of divergence
The bundle's `session-channel-envelope.test.ts:40` inlines a local
`makeFakeLogger()` instead of importing `makeSpyLogger` from
`tests/helpers/mocks.ts`. The sibling `citations-channel-envelope.test.ts:14`
(added in the same bundle) correctly uses `makeSpyLogger`, so the two
new files diverge from each other.

This is part of a pre-existing systemic drift — ~37 channel-envelope
test files inline `makeFakeLogger`; only a handful
(`recommendations-channel.test.ts`, `log-channel.test.ts`,
`citations-channel-envelope.test.ts`) use the shared factory. The v0.1.4
bundle entrenches the divergence rather than fixing it.

## Required action
Single sweep refactor: replace every inline `makeFakeLogger()`
declaration in `packages/desktop/electron/main/__tests__/*-channel*.test.ts`
with `import { makeSpyLogger } from "../../../tests/helpers/mocks.js"`
(or equivalent relative path). Confirm `makeSpyLogger` exposes the same
shape as the inline copies (it returns a `Logger` with spied `info` /
`warn` / `error` / `debug` / `child` methods); if not, extend it.

## Scope
~37 test files in `packages/desktop/electron/main/__tests__/`. Pure
mechanical replace; no test behavior change. Suitable for one
focused PR.

## Implementation notes

**Files updated: 19** (16 had inline `makeFakeLogger` declarations not yet
touched by earlier work; 3 had already been started via the session/packs/lock
files in this bundle).

**Factory selection: all 19 used `makeSpyLogger`** — every inline copy
returned `vi.fn()` spies on all methods (matching the `makeSpyLogger` contract)
and none of the 19 files asserted on `_spies.*` (those tests were already in
files that had been converted). The inline functions were pure sink+spy loggers
with no custom filtering, so no shared-factory extension was needed.

**Two non-mechanical fixes applied:**
- `streaming-channel-error-redaction.test.ts`: local function used `function
  self(): ReturnType<typeof makeFakeLogger>` for the `child` spy — Python
  brace-counter missed it; removed manually.
- `subagent-channel.test.ts`: two `as ReturnType<typeof makeFakeLogger>` type
  casts were referencing the now-deleted local; removed the casts entirely
  (they were unnecessary annotations).

**Verification:** `pnpm typecheck` clean; `pnpm --filter @praxis/desktop test
--reporter=basic` → 520 tests passed across 34 test files.
