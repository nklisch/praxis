---
id: fix-configure-prompt-tab-dirty-key-mismatch
kind: story
stage: done
tags: [ui, bug]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Fix Prompt tab change-dot: dirty-key mismatch "configure.prompt" vs "configure.prompts"

## Problem

`FragmentDocument` in `packages/ui/src/routes/configure/prompt-tab.tsx` (line 339)
registers its dirty state under the key `"configure.prompts"` (plural), but the
TABS array in `packages/ui/src/routes/configure.tsx` (line 25) registers the Prompt
tab button's change-dot observer against `"configure.prompt"` (no `s`).

Result: editing a fragment and saving an override correctly marks `"configure.prompts"`
as dirty, but `TabButton` observes `"configure.prompt"` — so the change-dot on the
Prompt tab button in the tab strip never lights up.

`useDirtyAggregate()` in `ConfigureSaveBar` aggregates all keys (both), so the
save-bar correctly shows when fragments are edited. Only the per-tab indicator is broken.

## Fix

Either:
1. Change `FragmentDocument` to use `useDirtyState("configure.prompt")` (match the TABS array), **or**
2. Change the TABS array entry to `dirtyKey: "configure.prompts"` (match the component).

Option 1 is the least-change fix; option 2 is consistent with the new component's key.
Pick one and make them match.

Also add a test to `configure-route.test.tsx` verifying the change-dot lights up on the
Prompt tab after a fragment is saved.

## Files

- `packages/ui/src/routes/configure/prompt-tab.tsx` line 339
- `packages/ui/src/routes/configure.tsx` line 25
- `packages/ui/src/__tests__/configure-route.test.tsx`

## Implementation notes

Chose option 2: updated the TABS array in `configure.tsx` line 25 from
`dirtyKey: "configure.prompt"` to `dirtyKey: "configure.prompts"` to match
the writer in `FragmentDocument` — "prompts" plural is more consistent with
the surface name.

Added regression test `"Prompt tab change-dot lights up when the prompts surface marks dirty"`
to `configure-route.test.tsx`. The test mocks `listFragmentOverrides` to return a
non-empty array, which causes `FragmentDocument`'s `useEffect` to call `markDirty()` on
`"configure.prompts"`, and then asserts the change-dot span (title="unsaved changes")
appears inside the Prompt tab button.

All 1576 UI tests pass; no new lint or typecheck errors introduced.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fix is correct. Option 2 (update TABS array to `"configure.prompts"`) is the right choice — the writer in `FragmentDocument` uses the plural key and that is now the single source of truth. The regression test correctly exercises the actual dirty-state flow: mocks `listFragmentOverrides` to return a non-empty array, waits for the change-dot span to appear in the Prompt tab button. Design alignment is clean; `ConfigureSaveBar` aggregate path was already correct and remains unaffected.
