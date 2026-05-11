---
id: feature-root-tsconfig-typecheck-coverage-scripts-cleanup
kind: story
stage: implementing
tags: [tooling]
parent: feature-root-tsconfig-typecheck-coverage
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
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
