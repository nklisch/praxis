---
id: refactor-useresource-adoption-sweep-step-3-prompt-tab
kind: story
stage: implementing
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
