---
id: story-fix-desktop-vitest-filter-tests-dir
kind: story
stage: done
tags: [tech-debt, testing, infra]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Fix `pnpm --filter @praxis/desktop test` — vitest looks for a non-existing `tests/` dir

## Brief
`pnpm --filter @praxis/desktop test` exits with an error referencing a
non-existing `tests` directory in `packages/desktop/`. Test files DO exist
at `packages/desktop/src/__tests__/` and
`packages/desktop/electron/main/__tests__/`, and they run fine via the
workspace runner (`pnpm vitest run packages/desktop/...`).

Likely cause: `vitest.workspace.ts` at the root or some other config
declares a `tests/` glob that doesn't match the desktop package's actual
test layout.

Two viable fixes — pick whichever lands cleaner:

1. Give the desktop package its own `vitest.config.ts` pointing at
   `src/__tests__/**/*.test.ts` and `electron/main/__tests__/**/*.test.ts`
2. Generalize the workspace config's glob so a missing `tests/` dir isn't
   fatal

## Acceptance
- `pnpm --filter @praxis/desktop test` exits 0 (or with real test
  failures only, not a missing-dir error)
- Workspace-level `pnpm test` still discovers and runs every desktop test
  it ran before
- Story-sized — a single config tweak

## Implementation Notes

**Actual error reproduced:** `pnpm --filter @praxis/desktop test` produced a
vitest Startup Error: `Projects definition references a non-existing file or a
directory: /home/nathan/dev/praxis/packages/desktop/tests`. Root cause: the
workspace `vitest.config.ts` uses `projects: ["packages/*", "tests"]`. When
vitest resolves `packages/desktop` (which had no `vitest.config.ts`), it falls
back to looking for a `tests/` subdirectory — which doesn't exist. The desktop
tests actually live in `src/__tests__/` and `electron/main/__tests__/`.

**Fix path chosen:** Option 1 — added `packages/desktop/vitest.config.ts`.
This is the cleaner long-term option and consistent with `packages/core` and
`packages/ui` which both have per-package configs. The new config explicitly
declares `include` globs for both test directories, uses the `praxis-source`
resolve condition (same as core), and sets `environment: "node"`.

**Files changed:**
- `packages/desktop/vitest.config.ts` (new file)

**Verification:**
- Before: `pnpm --filter @praxis/desktop test` → Startup Error (missing `tests/` dir)
- After: `pnpm --filter @praxis/desktop test` → 509 tests passing, 34 test
  files (3 from `src/__tests__/`, 31 from `electron/main/__tests__/`)
- Workspace `pnpm test`: 4540 passed | 23 skipped (4563) — identical before and after
- No new lint or typecheck errors introduced (pre-existing baseline unchanged)

## Review (2026-05-19)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Per-package `packages/desktop/vitest.config.ts` matches the pattern already used by `packages/core` and `packages/ui`. Correct `praxis-source` condition order (first, to short-circuit to source `.ts` per the workspace's `tsconfig.base.json` setup), and `include` globs match the actual test directories. 509 tests now discoverable via filter; workspace count unchanged.
