---
id: bug-chat-documents-sidebar-flicker
kind: story
stage: done
tags: [bug, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-17
---

# Chat documents sidebar flickers between library view and loading state

## Brief

In the chat window, the documents sidebar flashes between the library view and a loading state. The flicker suggests the sidebar is re-mounting or refetching on each render cycle (or a `loading` boolean flips back to true mid-stream) instead of holding a stable view once the library has loaded. Worth investigating the document list data source for the chat-scoped sidebar and confirming the loading state is only true on initial fetch — not on every dependency change.

## Suspected area

`packages/ui/src/components/` chat documents sidebar — likely a `useResource`/`useEffect` whose dependencies include a freshly-constructed object every render, or a stream subscription that flips `loading` back true on each event. Related pattern: `use-resource-hook`, `subscriber-fanout-stream`.

## Acceptance criteria

- After the initial library load, the sidebar holds the loaded view across normal chat-stream activity (no visible flash).
- `loading` is `true` only on first fetch, not on subsequent re-renders or stream events.
- A regression test pins the stable-after-loaded behavior.

## Implementation notes

### Root cause

`useDerivedScope()` (`packages/ui/src/hooks/use-derived-scope.ts`) returned a fresh
object literal on every render — e.g. `{ kind: "course", id: rawId }`. Even though the
`kind` and `id` values were identical across renders, each call produced a new object
reference. This meant:

1. `chat.tsx` line 64: `scopedLoader = useCallback(async () => ..., [client, scope])` got
   a new identity on every render (because `scope` was a new object reference).
2. `useResource(scopedLoader)` saw `loader` change → `refresh` changed → `useEffect`
   re-fired → `setLoading(true)` — producing the visible loading flash.

Any parent re-render caused by `TabsContext` emitting a new value (e.g., `switchTo`
updating `lastSeenAt` on the active tab's entry in `openTabs`) would trigger this chain
even though the logical scope (kind + id) hadn't changed.

The fix was applied in commit `df9f1f2` as part of
`epic-ui-rendering-stability-loop-flickers-sidebar`: wrap the returned `DerivedScope`
object in `useMemo([kind, id])` so two renders with the same primitive `kind`/`id` values
return the same object reference.

### Fix location

`packages/ui/src/hooks/use-derived-scope.ts` lines 114–118 — `useMemo<DerivedScope>(() =>
{ ... }, [kind, id])` at the end of the hook body.

### Regression test

`packages/ui/src/__tests__/chat-route.test.tsx` — "scoped sidebar does not re-fetch when
the tabs context emits an unrelated update" (final test in the `ChatRoute shell` describe
block). The test:
- Mocks `useMatches` to return a course route → `scope = { kind: "course", id: "course-stable" }`
- Renders `ChatRoute` with two tabs and a `documentScopes.listForScope` spy
- Waits for the initial scoped-docs fetch (call count = 1)
- Clicks the second tab → triggers `switchTo` → `setOpenTabs` with a new array reference
  → all `useTabs()` consumers re-render including `useDerivedScope`
- Asserts `listForScope` was still called exactly once

Verified: the test fails when the `useMemo` is removed from `useDerivedScope` and passes
with it in place.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode + regression-test addition. Underlying fix (the `useMemo([kind, id])` in `useDerivedScope`) shipped in `df9f1f2` as part of the loop-flickers epic. Today's commit `ae4e3e0` adds the regression test at `chat-route.test.tsx` that fails when the `useMemo` is removed and passes with it — the property is now pinned against future regressions.
