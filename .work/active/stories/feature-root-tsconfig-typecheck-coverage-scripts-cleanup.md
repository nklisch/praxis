---
id: feature-root-tsconfig-typecheck-coverage-scripts-cleanup
kind: story
stage: review
tags: [tooling]
parent: feature-root-tsconfig-typecheck-coverage
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
---

# Root-tsconfig cleanup: `scripts/`

## Scope

Fix the 5 typecheck errors in 3 files under `scripts/` that block enabling a
root-tier typecheck gate. Use the canonical `noopLogger` helper from
`tests/helpers/mocks.ts` rather than letting each script re-roll its own.

## Files

- `scripts/db-gates.ts` — 3 errors, all `Logger.child` missing on a locally-constructed logger object
- `scripts/db-packs.ts` — 2 errors, same `Logger.child` issue
- `scripts/run-session.ts` — multiple errors from stale imports (`IsolatedVmHost`, `codeSandboxTool`, `LocalCodeSandbox`) that haven't existed since `language-sandbox-registry` shipped, plus a `ToolContext` shape mismatch

## Approach for each file

**`scripts/db-gates.ts` and `scripts/db-packs.ts`** — replace the ad-hoc
logger with `noopLogger()`:

```typescript
// Before
const log = { debug: () => {}, info: ..., warn: ..., error: ... };
// After (or hoist if scripts can't import from tests):
import { noopLogger } from "../tests/helpers/mocks.js";
const log = noopLogger();
```

If `scripts/` can't import from `tests/` cleanly (path resolution quirks),
hoist `noopLogger` into a shared location (e.g.
`packages/core/src/test-helpers/logging.ts` or `scripts/helpers/`). Either is
acceptable — the goal is **one canonical source** so the next time `Logger`
grows a method, there's a single place to update.

**`scripts/run-session.ts`** — judgment call:

1. Run `git log -p scripts/run-session.ts` and look at the most recent
   intentional change (not auto-merge, not formatting). When was the script
   last meaningfully touched? Was it actively used recently?
2. Check whether `pnpm script:run-session` runs end-to-end against current
   `main`. (It probably doesn't, given the stale imports.)
3. Cross-check `idea-engine-cli-integration-smoke-test` in
   `.work/backlog/` — likely the same concept, scoped for redo from
   scratch.
4. **Choose**:
   - **Port** to current APIs (QuickJS sandbox via
     `language-sandbox-registry`, current tool exports). Reasonable if the
     script has recent meaningful commits and someone clearly uses it.
   - **Delete** the file AND the `script:run-session` entry in
     `package.json`. Reasonable if it's been broken for months and the
     backlog idea already captures the intent for redo.

   Default to delete unless evidence says otherwise. Either way, record the
   decision in implementation notes with the git history snippet you used.

## Acceptance criteria

- [ ] `pnpm exec tsgo --noEmit -p tsconfig.json 2>&1 | grep "^scripts/"`
      returns no error lines.
- [ ] If `noopLogger` was hoisted to a new location, all ad-hoc loggers
      across the repo were either updated to import from the new location or
      explicitly left alone with a note explaining why.
- [ ] If `scripts/run-session.ts` was deleted: `package.json`
      `script:run-session` entry removed, docs grep clean (the brief noted
      `docs/ROADMAP.md` and several design docs mention it — light edits
      or leave the historical references alone, document the choice).
- [ ] `pnpm -r run typecheck` still green (no regression).

## Out of scope

- Cleaning up `tests/` errors — that's a sibling story.
- Enabling the gate in `package.json` — that's Story 3.
- Restoring the smoke-test functionality if you delete `run-session.ts`.
  Use the existing `idea-engine-cli-integration-smoke-test` backlog item.

## Implementation notes

### `scripts/db-gates.ts` and `scripts/db-packs.ts`

Replaced each file's ad-hoc logger literal (missing the `child` method required
by the `Logger` type) with `noopLogger()` imported from
`../tests/helpers/mocks.js`. The root `tsconfig.json` includes both
`scripts/**/*` and `tests/**/*` under a shared `rootDir: "."`, so the relative
import resolves cleanly with no hoisting needed. No new files created — the
canonical SSOT in `tests/helpers/mocks.ts` is used as-is.

### `scripts/run-session.ts` — decision: **delete**

Git evidence:

```
582fb13 2026-04-28  Phase 4: verification tools (grade_math + code_sandbox)
13c73ee 2026-04-28  Phase 3: engine lifecycle (open/send/close) + SessionServiceImpl
ee4449c 2026-04-28  Phase 2 adapters: Direct, Claude Code, Codex + scripts + conformance suite
```

The last touch was Phase 4 (April 28, 2026) which wired in `IsolatedVmHost` and
`LocalCodeSandbox`. The `language-sandbox-registry` feature (shipped
subsequently) replaced both symbols; the script has been broken since with no
follow-up fix. No `idea-engine-cli-integration-smoke-test` item was found in
`.work/backlog/` (only `idea-root-vitest-praxis-source-condition.md` exists),
but the story body already references this intent and the `script:run-session`
entry in `package.json` was the only consumer. File deleted, entry removed from
`package.json`. Historical references in `docs/` (ROADMAP, design docs) left
alone — they describe past phase work, not a current contract.

### Helper hoist decision

Kept `noopLogger` in `tests/helpers/mocks.ts`. The root `tsconfig.json`'s
`include` covers both `scripts/` and `tests/` from the same `rootDir`, so no
hoist was needed. One canonical source, no duplication.

### Verification output

```
# scripts/ errors after fix:
$ pnpm exec tsgo --noEmit -p tsconfig.json 2>&1 | grep "^scripts/"
(empty — 0 errors)

# Full workspace typecheck:
$ pnpm -r run typecheck
packages/artifacts typecheck: Done
packages/claude-cli-sdk typecheck: Done
packages/memory typecheck: Done
packages/core typecheck: Done
packages/curriculum typecheck: Done
packages/engines typecheck: Done
packages/client typecheck: Done
packages/tools typecheck: Done
packages/ui typecheck: Done
packages/desktop typecheck: Done
```
