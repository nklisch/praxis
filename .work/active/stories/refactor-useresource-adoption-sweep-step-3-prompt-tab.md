---
id: refactor-useresource-adoption-sweep-step-3-prompt-tab
kind: story
stage: review
tags: [refactor, ui]
parent: refactor-useresource-adoption-sweep
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 3: prompt-tab — convert load operations to useResource

## Brief

`packages/ui/src/routes/configure/prompt-tab.tsx` has multiple async
operations sharing state (lines ~120-170). Some are loads (fit useResource);
others are save/preview mutations (don't fit — imperatively triggered).
Convert only the load operations.

## Files

- `packages/ui/src/routes/configure/prompt-tab.tsx` only

## Approach

1. **Read the file fully** before editing. The current shape is more
   mixed than memory-tab's clean per-loader blocks. Inventory each
   `setError(null)` / `setLoading(true)` site and classify as
   load-on-mount vs imperative-mutation.
2. **Load-on-mount operations** → useResource. Examples:
   - Fetching the current prompt customization for the selected mode
   - Fetching the available modes list
   - Fetching the global / append override drafts
3. **Imperative-mutation operations** → keep inline. Examples:
   - Save handler (commits draft to the store)
   - Preview-prompt handler (one-shot composition)
   - Reset-to-default handler
   
   These have their own state (e.g., `saving`, `saveError`) which is
   distinct from the load state. If they currently SHARE `[error, setError]`
   with a load, split into per-operation state:

   ```ts
   // before:
   const [error, setError] = useState<string | null>(null);  // shared between load + save
   
   // after:
   // load: useResource handles its own error
   // save:
   const [saveError, setSaveError] = useState<string | null>(null);
   const [saving, setSaving] = useState(false);
   ```

## Implementation notes

- If after the read the conversion looks awkward (e.g., load and save are
  so intertwined that splitting them creates more code), FLAG it. Better
  to leave the file as-is than force a poor fit. Append a
  `## Implementation discovery` section to the story body and return.
- The hook's `useResource(loader)` re-fires whenever the loader's identity
  changes. If the loader depends on the selected mode id, that's exactly
  the desired refresh-on-mode-change behavior.
- Watch for `useEffect(() => loadX(), [...])` calls — they should be
  REMOVED after the conversion (useResource owns the mount effect).

## Tests to verify

- `pnpm --filter @praxis/ui typecheck`
- `pnpm --filter @praxis/ui test` (any prompt-tab test — grep `__tests__/` for `prompt-tab`)
- `pnpm biome check packages/ui/src/routes/configure/prompt-tab.tsx`

Pre-existing baseline: 3 typecheck errors in UI files, ~524 `.mockups/**.html` lint errors, one flaky test. Treat as baseline.

## Acceptance criteria

- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] Load operations use useResource; mutation operations remain inline (with their own state if they were sharing)
- [ ] Save / preview / reset UX unchanged — smoke check by reading code paths
- [ ] File LoC drops by ~10-20 (smaller than the other two — mixed file)
- [ ] No regression in mode-switch refresh behavior

## Risk

**Low-medium** — mixed load+mutation file. The conversion is per-operation, not whole-file. If the mixed-state file resists clean separation, prefer to bail than to force.

## Rollback

`git revert <commit>` — clean.

## Implementation notes

### Async operation inventory and classification

`FragmentCard` component (per-fragment inline state):
- `useEffect` syncing `draft` to `currentText` — NOT async, derived state sync, no change
- `handleSave` — **mutation** (save button handler); owns `[saving, setSaving]` and `[error, setError]` local to the card; kept inline
- `handleRevert` — **mutation** (revert/clear button handler); shares same local `[saving/reverting, error]` state; kept inline

`FragmentDocument` component:
- `useEffect` + `setComposedLoading` / `setComposedSegments` (lines 372–388) — **load-on-mount + load-on-modeId-change** → converted to `useResource`
- `refreshComposed` useCallback — imperative refresh called after save/clear → replaced by `refresh` from `useResource`
- `handleSave` — **mutation** (customizePrompt → refreshOverrides → refreshComposed); kept inline
- `handleClear` — **mutation** (clearFragmentOverride → refreshOverrides → refreshComposed); kept inline
- `overrides` state (`useFragmentOverrides`) — already an encapsulated hook, no change

### State splits

No state split was needed. The composed preview state (`composedSegments`, `composedLoading`) was separate from all mutation state; no shared `[error, setError]` between load and mutation existed at the `FragmentDocument` level. The `FragmentCard`-level error is purely per-mutation (save/revert) and was not affected.

### What changed

- Removed: `useState<readonly ComposedSegment[]>([])` for composedSegments
- Removed: `useState(false)` for composedLoading
- Removed: `useCallback` for `refreshComposed` (manual fetch + setState)
- Removed: `useEffect` (lines 372–388) — the manual load-on-mount with cancellation token
- Added: `import { useResource }` from `../../hooks/use-resource.js`
- Added: `composedLoader` useCallback wrapping `client.author.previewPromptWithAttribution({ modeId })`, deps `[client, modeId]`
- Added: `useResource(composedLoader)` — provides `composedData`, `composedLoading`, `refreshComposed`
- Added: `composedSegments` derived as `composedData?.segments ?? []`
- `handleSave` and `handleClear` now call `refresh` from `useResource` (same semantics)

### File LoC delta

Before: 491 lines. After: 477 lines. Delta: −14 lines.

### Baseline confirmation

- `pnpm --filter @praxis/ui typecheck`: green (0 new errors)
- `pnpm --filter @praxis/ui test`: 1600/1600 passed (155 test files)
- `pnpm biome check packages/ui/src/routes/configure/prompt-tab.tsx`: clean (no fixes applied)
- Pre-existing baseline (3 typecheck errors in other UI files, 524 mockup lint errors, flaky use-fragment-overrides test): unchanged
