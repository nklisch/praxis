---
id: epic-backend-fills-for-redesign-cross-tab-state-dirty-tracker
kind: story
stage: implementing
tags: [ui]
parent: epic-backend-fills-for-redesign-cross-tab-state
depends_on: []
release_binding: null
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
