---
id: story-root-vitest-praxis-source-condition
kind: story
stage: review
tags: [testing, tooling, dx]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-17
---

# Root-level vitest should resolve `@praxis/*` imports via `praxis-source` condition

## Brief

Vitest at the workspace root reads package imports from each package's `dist/` rather than `src/`. `pnpm test` (and `pnpm vitest run tests/...`) requires `pnpm --filter @praxis/core build` after a source edit before root-level integration tests under `tests/` can see the change.

The `praxis-source` custom export condition IS wired in `packages/ui/vitest.config.ts` (and presumably each per-package vitest config) so that within a package's own tests, imports resolve to source. But there's no root-level vitest config that declares the same condition for the integration tests under `tests/` — so those tests effectively run against built artifacts.

## Why it matters

The `praxis-source` condition exists specifically so the inner dev loop doesn't require a build step between source edit and test feedback. Root integration tests currently miss out on that property — they're the layer most likely to catch wiring bugs across packages (like the QuickCheck wiring story that surfaced this), but they're also the layer with the slowest feedback loop because of the missing condition.

This is workflow friction, not correctness — root tests do still see source changes once a build is run. The bug-class affected is "tests pass locally on a previously-built tree, but the most-recent source edit isn't the thing under test" — silent staleness.

## Direction

Add a root-level vitest config (or augment `vitest.workspace.ts`) that declares the `praxis-source` resolver condition for the `tests/` project, matching what each per-package config already does.

## Acceptance criteria

1. Edit a source file in `packages/core/src/`.
2. Run `pnpm vitest run tests/<some-integration-test>.test.ts` without building.
3. The edit is visible to the test.

## Anchors

- Root workspace — `vitest.workspace.ts`
- Per-package example — `packages/ui/vitest.config.ts` (look for `resolve.conditions` including `praxis-source`)
- Base `tsconfig.base.json` — defines the `praxis-source` custom TS condition for type resolution

## Implementation notes

### Option chosen: B (new root `vitest.config.ts` + `tests/vitest.config.ts`)

Option A (inline config object in `vitest.workspace.ts`) was attempted first but failed: Vitest 3's inline project config objects don't honour `resolve.conditions` at runtime because Vite 7 uses the SSR resolver for node-environment tests and `resolve.conditions` (client-side) doesn't propagate to `ssr.resolve.conditions`. The inline approach also had no file to add `ssr.resolve.conditions` to.

Option B was chosen because:
1. Vitest 3 deprecated `vitest.workspace.ts` in favour of `test.projects` in a root `vitest.config.ts` — this migration was needed anyway.
2. A file-based project config (`tests/vitest.config.ts`) lets us set both `resolve.conditions` AND `ssr.resolve.conditions` / `ssr.resolve.externalConditions`, which is what vitest needs for node-environment tests.

### Files changed

- `/home/nathan/dev/praxis/vitest.workspace.ts` — deleted (replaced by `vitest.config.ts`)
- `/home/nathan/dev/praxis/vitest.config.ts` — created (new root config using `test.projects: ["packages/*", "tests"]`)
- `/home/nathan/dev/praxis/tests/vitest.config.ts` — created (per-project config for `tests/` with `praxis-source` in both `resolve.conditions` and `ssr.resolve.conditions`)

The key insight: Vitest uses Vite's SSR mode for node-environment test execution. For conditions to apply to `@praxis/*` package resolution in SSR mode, `ssr.resolve.conditions` and `ssr.resolve.externalConditions` must include `"praxis-source"`. Setting only `resolve.conditions` (client-side) is insufficient.

### Verification result

1. Added `export const __PRAXIS_SOURCE_PROBE = true` to `packages/core/src/index.ts`.
2. Created `tests/praxis-source-probe.test.ts` that imports `__PRAXIS_SOURCE_PROBE` from `@praxis/core` and asserts it's `true`.
3. Ran `pnpm vitest run tests/praxis-source-probe.test.ts` **without** `pnpm build` — test passed. Debug output confirmed Vite's transform resolved `@praxis/core` to `src/index.ts` (via `praxis-source` condition).
4. Removed `__PRAXIS_SOURCE_PROBE` from source and deleted probe test.
5. Full test suite (`pnpm test`): **365 test files passed, 3658 tests passed** — no regressions.
