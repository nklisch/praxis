---
id: idea-fix-desktop-vitest-filter-tests-dir
kind: idea
tags: [tech-debt, testing, infra]
created: 2026-05-18
---

# Fix `pnpm --filter @praxis/desktop test` — vitest looks for a non-existing `tests/` dir

Multiple agents during the 2026-05-18 autopilot run reported that
`pnpm --filter @praxis/desktop test` exits with an error referencing a
non-existing `tests` directory in `packages/desktop/`. Test files DO exist
at `packages/desktop/src/__tests__/` and
`packages/desktop/electron/main/__tests__/`, and they run fine via the
workspace runner (`pnpm vitest run packages/desktop/...`).

Likely cause: `vitest.workspace.ts` at the root or some other config
declares a `tests/` glob that doesn't match the desktop package's actual
test layout. Either:

1. The desktop package needs its own `vitest.config.ts` pointing at
   `src/__tests__/**/*.test.ts` and `electron/main/__tests__/**/*.test.ts`
2. The workspace config's glob needs to be generalized so a missing
   `tests/` dir isn't fatal

Effect on autopilot: every desktop-touching story today reported "desktop
test runner has a pre-existing startup failure (vitest references
non-existing `tests/` dir)". Verification falls back to workspace-level
`pnpm test` which DOES exercise desktop tests through the workspace
runner — so it's not blocking, just noisy.

Story-sized. Single config tweak likely.
