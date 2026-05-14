---
id: epic-ui-rendering-stability-loop-flickers-sidebar
kind: story
stage: done
tags: [ui, bug]
parent: epic-ui-rendering-stability-loop-flickers
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Stabilize `useDerivedScope` return identity to stop sidebar flicker

## Scope

Fix the documents sidebar flicker by memoizing the object returned from
`useDerivedScope()`. Currently the hook returns a freshly-constructed
object literal every call (e.g. `{ kind: "course", id: rawId }`), which
churns the `scopedLoader` `useCallback` identity in
`packages/ui/src/routes/chat.tsx:62-70` and re-fires the
`useResource`-internal `useEffect` on every parent re-render — flashing
the sidebar between its library view and a loading state.

See parent feature
(`.work/active/features/epic-ui-rendering-stability-loop-flickers.md`)
for the full diagnosis under "Bug 1 — Documents sidebar flicker" and
the design under "Unit 1".

## Files

- `packages/ui/src/hooks/use-derived-scope.ts` — refactor to compute
  `(kind, id)` primitives, then wrap the returned object in `useMemo`
  keyed on those primitives.
- `packages/ui/src/hooks/__tests__/use-derived-scope.test.ts` — new
  file; add the reference-stability and branch-correctness tests
  described in the parent feature's Testing section (Unit 1).

## Acceptance Criteria

- [ ] Two consecutive renders with identical route + tabs state return
      the SAME object reference (`Object.is(prev, curr) === true`).
- [ ] Changing the route's `courseId` param produces a new reference
      with the new id.
- [ ] Switching from a non-document tab to a document tab while on a
      course route returns `{ kind: "all" }` (unchanged behavior).
- [ ] Bootstrap session branch still returns
      `{ kind: "session", id: sessionId }`.
- [ ] The documents sidebar in `chat.tsx` no longer flashes when an
      unrelated parent re-render fires (verify via React DevTools
      Profiler in dev mode: `useResource`'s effect runs once per scope
      change, not once per parent render).
- [ ] `pnpm --filter @praxis/ui test` passes locally, including the new
      hook test.
- [ ] `pnpm typecheck` and `pnpm lint` are clean.

## Notes

- Use the `ui-test-helper` pattern (`makeFakeClient` +
  `<PraxisClientProvider>`) and the `async importOriginal` form to
  mock `useMatches` and `useTabs`.
- Preserve the existing JSDoc decision-tree commentary. This change is
  identity, not branching.
- Don't merge anything new into `useResource` — the fix belongs in the
  caller of `useResource`, not in the helper itself.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: Tab indentation in `use-derived-scope.ts` differs from rest of file's prior spaces; auto-formatter likely normalised on save. Not blocking.

**Notes**: 15 tests pass (against the committed state). `useMemo` keyed on primitives correctly stabilises returned reference. Branch logic preserved.
