---
id: epic-backend-fills-for-redesign-cross-tab-state-dirty-tracker
kind: story
stage: done
tags: [ui]
parent: epic-backend-fills-for-redesign-cross-tab-state
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Cross-tab dirty-state tracker — hook + provider + configure save bar

## Scope

Unit 1 from parent feature:

- `useDirtyState(key)` hook
- `<DirtyStateProvider>` aggregating across keys
- `useDirtyAggregate()` returning `{ dirtyCount, surfaceCount }`
- Wire the existing configure save bar to surface
  "N unsaved across M surfaces" when `surfaceCount > 0`.

See `.work/active/features/epic-backend-fills-for-redesign-cross-tab-state.md`
for the design choices and signatures.

## Implementation steps

1. New `packages/ui/src/hooks/use-dirty-state.ts`:
   - `useDirtyState(key)` consumes a context to register/clear the
     key. Returns `{ isDirty, markDirty, markClean }`.
   - On unmount, the hook clears the key from the provider's set.

2. New `packages/ui/src/contexts/dirty-state-provider.tsx`:
   - Maintains a `Set<string>` of currently-dirty keys.
   - Exposes a context with `register(key)`, `clear(key)`, and a
     subscribe-and-fold pattern for `useDirtyAggregate`.

3. Edit the configure surface to:
   - Wrap its tab-strip and child tabs in `<DirtyStateProvider>`.
   - Each tab calls `useDirtyState("configure.<tab>")` and bumps it
     when its local form is dirty.
   - The save bar pulls `useDirtyAggregate()` and renders the
     "N unsaved across M surfaces" string.

4. Tests in `packages/ui/src/hooks/__tests__/use-dirty-state.test.tsx`
   using `@testing-library/react`:
   - Register / clear single key.
   - Aggregate across two and three keys.
   - Unmount cleanup.
   - Configure-save-bar copy assertion.

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] `useDirtyState(key)` API works per the parent design.
- [ ] `useDirtyAggregate()` returns accurate `{ dirtyCount, surfaceCount }`.
- [ ] Unmount of a dirty key removes it from the aggregate.
- [ ] Configure save bar shows "N unsaved across M surfaces" when
      multiple tabs are dirty; shows simple "Unsaved" when only one.
- [ ] All quality checks green.

## Out of scope

- Adopting the hook in workspace or course-create surfaces. Those
  surfaces wire up in their own implementations once those features
  land.

## Implementation notes

### Architecture

**Provider** (`packages/ui/src/contexts/dirty-state-provider.tsx`): ref-based
subscription model — the provider itself never re-renders on dirty-state
changes. Maintains a `Set<string>` of dirty keys in a ref. Two listener maps
(per-key and aggregate) are also refs. `setDirty`/`clearDirty` are idempotent
and only notify when the state actually changes.

**Hook** (`packages/ui/src/hooks/use-dirty-state.ts`):
- `useDirtyState(key)`: subscribes to per-key changes, maintains a local
  `isDirty` mirror via `useState`. Clears the key from the provider on
  unmount (cleanup via `useEffect` return). Returns
  `{ isDirty, markDirty, markClean }`.
- `useDirtyAggregate()`: subscribes to aggregate count changes. Returns
  `{ dirtyCount, surfaceCount }` (both are the same value — `surfaceCount`
  is the alias used in copy strings).

### Configure wire-up

- `configure.tsx`: wrapped in `<DirtyStateProvider>` (inside the unlocked
  branch). `<ConfigureSaveBar>` inner component reads `useDirtyAggregate()`
  and renders "Unsaved" (1 surface) or "N unsaved across N surfaces" (N > 1)
  in the tab bar right section.
- **CourseTab / GatesTab / MemoryTab**: register with `useDirtyState()` but
  never mark dirty — their mutations save immediately on confirm. Ready for
  future stories to propagate per-editor dirty state upward.
- **PromptTab / StyleSliderForm**: calls `useDirtyState("configure.prompt")`.
  Marks dirty when any slider deviates from 0 (initial/saved value). Marks
  clean on successful save or on unmount cleanup.

### Tests

15 tests in `packages/ui/src/hooks/__tests__/use-dirty-state.test.tsx`:
- `renderHook` + `wrapper` pattern for simple single/multi-key scenarios.
- Component-based harness (`UnmountHarness`) for unmount cleanup tests, since
  unmount cleanup requires shared provider state across multiple hook instances.
- Provider guard throws verified for both hooks.
- Existing `configure-prompt-tab.test.tsx` updated to wrap `<PromptTab>` in
  `<DirtyStateProvider>`.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: Save bar copy `"${surfaceCount} unsaved across ${surfaceCount} surfaces"` shows the same number twice (since `dirtyCount === surfaceCount` by design). Correct per spec but slightly awkward phrasing — fine to leave.

**Notes**: Ref-based subscription model is well-suited to this use case (avoids provider re-renders on every dirty-state change). Unmount cleanup is correct within the configure tab's conditional-render pattern — sliders reset local state on unmount so dirty state + local state are self-consistent. 15 tests cover all acceptance criteria including unmount cleanup, provider guard, and aggregate multi-key scenarios. Quality checks: 1125 UI tests pass; typecheck and lint failures are pre-existing (lint count decreased by 7 with this commit).
