---
id: feature-root-tsconfig-typecheck-coverage-enable-gate
kind: story
stage: implementing
tags: [tooling]
parent: feature-root-tsconfig-typecheck-coverage
depends_on:
  - feature-root-tsconfig-typecheck-coverage-scripts-cleanup
  - feature-root-tsconfig-typecheck-coverage-tests-cleanup
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Enable root-tsconfig typecheck gate

## Scope

Wire root-tsconfig typechecking into the workspace `typecheck` script so the
gate that the cleanup stories just made green stays green. One-line edit
plus a smoke test to confirm the gate actually catches regressions.

## Dependency

Depends on both cleanup stories. Story 3 cannot ship until
`pnpm exec tsgo --noEmit -p tsconfig.json` exits 0. The orchestrator will run
this story in a wave after both predecessors land.

## Change

`package.json` (root `scripts` block):

```diff
- "typecheck": "pnpm -r run typecheck",
+ "typecheck": "pnpm -r run typecheck && tsgo --noEmit -p tsconfig.json",
```

Per-package step still runs first (more granular, more likely to produce
useful errors); root is appended as the final gate.

`tsgo` is already a devDep of the workspace (it's what each package's
`typecheck` script uses). No new dependency needed.

## Smoke test (manual)

After the edit:

1. `pnpm typecheck` from the repo root — expect green.
2. Open `tests/foundation.test.ts` (or any root-tier file), insert a
   deliberate type error like `let x: string = 1;`.
3. `pnpm typecheck` again — expect non-zero exit with the deliberate error
   reported.
4. Revert the deliberate error. `pnpm typecheck` — green again.

Document the smoke-test result in implementation notes. The smoke test
itself isn't committed — it's a one-off verification of the gate's wiring.

## Documentation touch-up

Read `CLAUDE.md`'s "Common commands" section. The current line is:

```
pnpm typecheck          # uses tsgo (TS native preview) — ~10× faster than tsc
```

If that wording implies the typecheck only covers packages (or if a sibling
sentence does), tighten it to note that root-tier files (`tests/`, `scripts/`)
are now also covered. Light edit; don't expand the scope of this story into a
docs rewrite.

## Acceptance criteria

- [ ] `pnpm typecheck` from the repo root runs both steps and exits 0.
- [ ] Smoke test passes: deliberate error in a root-tier file causes
      `pnpm typecheck` to exit non-zero. (Documented in implementation
      notes; not committed as a test.)
- [ ] `package.json` change is the only code edit (plus optional `CLAUDE.md`
      wording tightening).
- [ ] No `typecheck:root` alias is added — the entry point stays unified.

## Out of scope

- Adding root-tier lint coverage. Biome already runs over the whole repo.
- Adding test coverage for `scripts/`. They're scripts, not modules.
- Reorganizing `tsconfig.json` / `tsconfig.base.json`. The existing
  `include` in `tsconfig.json` is already correct.
- Adding pre-commit or CI workflow changes. The script change is enough —
  whoever runs `pnpm typecheck` (locally, in CI, in pre-commit, in
  `/agile-workflow:implement-orchestrator`'s verification) now gets the
  full coverage.
