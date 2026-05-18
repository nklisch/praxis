---
id: fix-configure-prompt-tab-dirty-key-mismatch
kind: story
stage: implementing
tags: [ui, bug]
parent: null
depends_on: []
release_binding: null
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
