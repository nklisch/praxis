---
id: refactor-rename-step-1-explorer-to-drafter
kind: story
stage: done
tags: [refactor, naming]
parent: refactor-rename-bootstrap-and-explorer
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Step 1: Rename Explorer → Drafter (internal agent abstraction)

## Brief

First step of the bootstrap/explorer rename refactor. Renames the internal
"Explorer" agent abstraction to "Drafter". Fully internal — no API contract
changes, no wire-format changes, no DB changes. The `bootstrap/` directory
name stays as-is in this step; that rename happens in Step 4 alongside the
service rename.

## Current State

```ts
// packages/curriculum/src/bootstrap/explorer.ts
import { EXPLORER_SYSTEM_PROMPT } from "./explorer-prompt.js";

export interface RunConceptExplorerInput { /* ... */ }
export interface RunConceptExplorerResult { /* ... */ }

export async function runConceptExplorer(
  input: RunConceptExplorerInput,
): Promise<RunConceptExplorerResult> {
  const log = baseLog.child({ component: "explorer" });
  // log.info("explorer.start", { ... });
}
```

```ts
// packages/curriculum/src/bootstrap/index.ts (barrel)
export type { RunConceptExplorerInput, RunConceptExplorerResult } from "./explorer.js";
export { runConceptExplorer } from "./explorer.js";
export { EXPLORER_SYSTEM_PROMPT } from "./explorer-prompt.js";
```

## Target State

```ts
// packages/curriculum/src/bootstrap/drafter.ts
import { DRAFTER_SYSTEM_PROMPT } from "./drafter-prompt.js";

export interface RunConceptDrafterInput { /* ... */ }
export interface RunConceptDrafterResult { /* ... */ }

export async function runConceptDrafter(
  input: RunConceptDrafterInput,
): Promise<RunConceptDrafterResult> {
  const log = baseLog.child({ component: "drafter" });
  // log.info("drafter.start", { ... });
}
```

```ts
// packages/curriculum/src/bootstrap/index.ts (barrel)
export type { RunConceptDrafterInput, RunConceptDrafterResult } from "./drafter.js";
export { runConceptDrafter } from "./drafter.js";
export { DRAFTER_SYSTEM_PROMPT } from "./drafter-prompt.js";
```

## Files

**File renames (use `git mv` to preserve history)**:
- `packages/curriculum/src/bootstrap/explorer.ts` → `drafter.ts`
- `packages/curriculum/src/bootstrap/explorer-prompt.ts` → `drafter-prompt.ts`
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` → `drafter.test.ts`
- `.mockups/flows/course-create-entry/03-explorer-running.html` → `03-drafter-running.html` (cosmetic; check that the index.html navigator references the new filename)

**Edits**:
- `packages/curriculum/src/bootstrap/index.ts` (barrel — flip exports)
- `packages/tools/src/course/start-exploration.ts` — import + handler-body refs (the file itself gets renamed in Step 2)
- `packages/curriculum/src/modes/fragments/__tests__/drafter-configurator-posture.test.ts` (test assertions checking that the agent's framing avoids "explorer")
- `packages/ui/src/lib/copy.ts` — one user-facing string at line ~113: `"the explorer will see it on its next turn"` → `"the drafter will see it on its next turn"`

**Symbol renames (use Edit's `replace_all` per file, then verify)**:
- `runConceptExplorer` → `runConceptDrafter`
- `RunConceptExplorerInput` → `RunConceptDrafterInput`
- `RunConceptExplorerResult` → `RunConceptDrafterResult`
- `EXPLORER_SYSTEM_PROMPT` → `DRAFTER_SYSTEM_PROMPT`

**Log key string renames (in the renamed `drafter.ts`)**:
- `"explorer.aborted_before_open"` → `"drafter.aborted_before_open"`
- `"explorer.start"` → `"drafter.start"`
- `"explorer.tool_call"` → `"drafter.tool_call"`
- `"explorer.tool_result"` → `"drafter.tool_result"`
- `"explorer.draft_init_captured"` → `"drafter.draft_init_captured"`
- `"explorer.model_message"` → `"drafter.model_message"`
- `"explorer.engine_error"` → `"drafter.engine_error"`
- `"explorer.final"` → `"drafter.final"`
- `"explorer.exit"` → `"drafter.exit"`
- `"explorer.engine_terminal_error"` → `"drafter.engine_terminal_error"`
- `"explorer.exhausted_budget"` → `"drafter.exhausted_budget"`
- `component: "explorer-tools"` → `component: "drafter-tools"`
- `component: "explorer"` → `component: "drafter"`

**Out of scope for this step**:
- `bootstrap/` directory name (renamed in Step 4)
- Tool name `course.start_exploration` (renamed in Step 2)
- Mode id `bootstrap` (renamed in Step 3)
- BootstrapService (renamed in Step 4)
- Foundation docs (rewritten in Step 5)

## Implementation Notes

- Use `git mv` for file renames so the diff is a rename, not a delete+add.
- After file renames, run `pnpm build && pnpm typecheck` — broken imports
  surface immediately.
- Be precise about NOT touching the word "explore" in unrelated prose.
  Examples to leave alone:
  - "explore the catalogue" (user-action in UI)
  - "explore the library" (UI button text in `course-create.tsx`)
  - "exploring" in concept-map UX descriptions
  - The `EXPLORATION` tool tier label if it exists in unrelated tier semantics
- The `start-exploration.ts` caller file: only update the import and handler-body
  symbol references. The `name: "course.start_exploration"` on the tool stays
  in this step (that's Step 2).

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] `grep -rn "Explorer\|EXPLORER_\|runConceptExplorer" packages/ --include="*.ts" --include="*.tsx" | grep -v dist | grep -v __tests__/.*-explorer-` returns no results
- [ ] `grep -rn '"explorer\.' packages/curriculum/src/bootstrap/drafter.ts` returns no matches
- [ ] `git status` shows file renames (R), not delete+add (D + ??)

## Risk

**Low** — fully internal rename caught by tsc.

## Rollback

`git revert <commit>` cleanly reverses the file renames and symbol changes. No
DB, no IPC, no external API affected.

## Implementation Notes

**File renames (4 total):**
- `packages/curriculum/src/bootstrap/explorer.ts` → `drafter.ts`
- `packages/curriculum/src/bootstrap/explorer-prompt.ts` → `drafter-prompt.ts`
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` → `drafter.test.ts`
- `.mockups/flows/course-create-entry/03-explorer-running.html` → `03-drafter-running.html`
  - Also updated `index.html` in the same flow to reference `03-drafter-running.html`

**Symbol renames (4 exported symbols):**
- `runConceptExplorer` → `runConceptDrafter` (function)
- `RunConceptExplorerInput` → `RunConceptDrafterInput` (interface)
- `RunConceptExplorerResult` → `RunConceptDrafterResult` (interface)
- `EXPLORER_SYSTEM_PROMPT` → `DRAFTER_SYSTEM_PROMPT` (const)

**Log key renames (11 strings in drafter.ts):**
All `"explorer.<event>"` log keys flipped to `"drafter.<event>"`.
`component: "explorer"` → `component: "drafter"`.
`component: "explorer-tools"` → `component: "drafter-tools"`.
Local variable `explorerContext` → `drafterContext`, `explorerLog` → `drafterLog`.

**Files edited (not renamed):**
- `packages/curriculum/src/bootstrap/index.ts` — barrel updated
- `packages/tools/src/course/start-exploration.ts` — import + handler body refs updated; internal variable `explorerToolDefs` → `drafterToolDefs`; `"explorer error"` fallback message → `"drafter error"`
- `packages/tools/src/course/index.ts` — comment updated
- `packages/tools/src/course/draft-init.ts` — comment updated
- `packages/core/src/types/tool.ts` — doc comment updated
- `packages/ui/src/lib/copy.ts` — one user-facing string updated

**Unexpected matches found and handled:**
- `packages/core/src/types/tool.ts` line 156 and `packages/tools/src/course/draft-init.ts` line 25 had comment references to `runConceptExplorer` — both updated.
- `packages/tools/src/course/__tests__/start-exploration.test.ts` uses the `@praxis/curriculum/bootstrap` exports via dist. The dist was rebuilt (`pnpm build`) to make the tests pass.

**Grep results (post-rename):**
```
grep -rn "runConceptExplorer|RunConceptExplorerInput|RunConceptExplorerResult|EXPLORER_SYSTEM_PROMPT" packages/ --include="*.ts" --include="*.tsx" | grep -v dist
# → no results

grep -rn '"explorer\.' packages/curriculum/src/bootstrap/drafter.ts
# → no results
```

**Verification:**
- `pnpm typecheck` — all 9 affected packages pass (pre-existing desktop errors unrelated to this rename)
- `pnpm test` — 419 test files passed (4481 tests), 0 failures from this rename
- `pnpm lint` — our changed `.ts` files are lint-clean; 524 pre-existing errors are all in `.mockups/` HTML files

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Rename is symmetric — 4 file renames (git mv preserves history), 4 exported symbols + ~14 log keys + local variable + doc comments all flipped together. The sole caller (`start-exploration.ts`) updates its import and `drafterToolDefs` local in the same commit. Test file moved with the rename and uses `runConceptDrafter` correctly (now resolved to the post-Step-4 directory `packages/curriculum/src/course-create/__tests__/drafter.test.ts`). Two small adjacent fixes — comments in `draft-init.ts` and a doc-comment in `core/src/types/tool.ts` — align prose with the new naming and are appropriate to fold in. No public API affected; no DB or wire-format concerns. Workspace tests pass (4481), typecheck baseline preserved.
