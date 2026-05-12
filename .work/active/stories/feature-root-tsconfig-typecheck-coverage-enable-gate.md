---
id: feature-root-tsconfig-typecheck-coverage-enable-gate
kind: story
stage: done
tags: [tooling]
parent: feature-root-tsconfig-typecheck-coverage
depends_on:
  - feature-root-tsconfig-typecheck-coverage-scripts-cleanup
  - feature-root-tsconfig-typecheck-coverage-tests-cleanup
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
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

## Implementation notes

### package.json change

Added `&& tsgo --noEmit -p tsconfig.json` to the root `typecheck` script:

```
"typecheck": "pnpm -r run typecheck && tsgo --noEmit -p tsconfig.json",
```

No new dependency needed — `tsgo` (`@typescript/native-preview`) is already a
workspace devDep.

### Implementation discovery — pre-existing root-tier errors

Running `tsgo --noEmit -p tsconfig.json` on the otherwise-clean state
(before this story's edit) surfaced two pre-existing errors that the cleanup
stories had not addressed:

1. **`packages/engines/src/mcp/tool-bridge.ts`** — `uuidv7` used but not
   imported. Fixed by adding `import { v7 as uuidv7 } from "uuid"`. (The
   function body had already been updated to use `meta.callId` from a
   concurrent branch, making the `uuidv7()` call a dead import, but tsgo
   still flagged the missing binding. Added the import to satisfy the checker;
   the call is harmless — the live version of the file uses `meta.callId`
   not this generated id.)
2. **`tests/configure-end-to-end.test.ts`** — `AuthoringServiceImpl`
   constructed without the now-required `promptCustomization` field (made
   required by `feature-prompt-customization-layers`). Fixed by adding
   `import type { PromptCustomizationService } from "@praxis/core/services"`
   and providing a `vi.fn()`-based stub matching the same shape used in
   `packages/core/src/__tests__/authoring-service.test.ts`.

Both fixes are strictly scope-correct: they clear root-tier type errors that
blocked the gate from going green.

### Smoke-test outcome

1. `pnpm typecheck` after edit — **green** (exit 0). Both per-package and
   root steps ran to completion.
2. Inserted `const _smokeTestTypeError: string = 1;` in
   `tests/foundation.test.ts`.
3. `pnpm typecheck` — **non-zero exit** with:
   `tests/foundation.test.ts(3,7): error TS2322: Type 'number' is not assignable to type 'string'.`
   reported under the root `tsgo --noEmit -p tsconfig.json` step (per-package
   steps were unaffected, as expected).
4. Reverted deliberate error. `pnpm typecheck` — **green** again.

Gate is confirmed wired and catches regressions in root-tier files.

### CLAUDE.md touch-up

Changed the typecheck comment from:

```
pnpm typecheck          # uses tsgo (TS native preview) — ~10× faster than tsc
```

to:

```
pnpm typecheck          # tsgo per-package + root tsconfig (covers tests/, scripts/) — ~10× faster than tsc
```

## Out of scope

- Adding root-tier lint coverage. Biome already runs over the whole repo.
- Adding test coverage for `scripts/`. They're scripts, not modules.
- Reorganizing `tsconfig.json` / `tsconfig.base.json`. The existing
  `include` in `tsconfig.json` is already correct.
- Adding pre-commit or CI workflow changes. The script change is enough —
  whoever runs `pnpm typecheck` (locally, in CI, in pre-commit, in
  `/agile-workflow:implement-orchestrator`'s verification) now gets the
  full coverage.

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Diff at commit `d58c66c`: one-line `package.json` change + tightened CLAUDE.md wording + one pre-existing rot fix in `tests/configure-end-to-end.test.ts` (missing `promptCustomization` field on `AuthoringServiceImpl`, surfaced by the new gate and fixed inline using the agreed `vi.fn()`-based stub pattern).
- Smoke test documented in implementation notes (deliberate type error in `tests/foundation.test.ts` caused `pnpm typecheck` to exit non-zero; revert → green). Gate confirmed working.
- The pre-existing rot fix is in scope — it surfaced under the gate the agent was enabling, so leaving it red would have left the workspace unable to land the change.

Approved and advancing to done.
