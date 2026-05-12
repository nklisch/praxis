---
id: idea-root-vitest-praxis-source-condition
kind: idea
stage: backlog
tags: [testing, tooling, dx]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Root-level vitest should resolve `@praxis/*` imports via `praxis-source` condition

## Observation

Surfaced during review of `story-fix-quickcheck-toolcontext-wiring`:

> Vitest at the workspace root reads package imports from each package's
> `dist/` rather than `src/`. `pnpm test` (and `pnpm vitest run tests/...`)
> requires `pnpm --filter @praxis/core build` after a source edit before
> root-level integration tests under `tests/` can see the change.
>
> The `praxis-source` custom export condition IS wired in
> `packages/ui/vitest.config.ts` (and presumably each per-package vitest
> config) so that within a package's own tests, imports resolve to source.
> But there's no root-level vitest config that declares the same condition
> for the integration tests under `tests/` — so those tests effectively run
> against built artifacts.

## Why it matters

The `praxis-source` condition exists specifically so the inner dev loop
doesn't require a build step between source edit and test feedback. Root
integration tests currently miss out on that property — they're the layer
most likely to catch wiring bugs across packages (like the QuickCheck
wiring story that surfaced this), but they're also the layer with the
slowest feedback loop because of the missing condition.

This is workflow friction, not correctness — root tests do still see
source changes once a build is run. The bug-class affected is "tests pass
locally on a previously-built tree, but the most-recent source edit isn't
the thing under test" — silent staleness.

## Direction

Add a root-level vitest config (or augment `vitest.workspace.ts`) that
declares the `praxis-source` resolver condition for the `tests/` project,
matching what each per-package config already does. Verify by:

1. Edit a source file in `packages/core/src/`.
2. Run `pnpm vitest run tests/<some-integration-test>.test.ts` without
   building.
3. Confirm the edit is visible to the test.
