---
id: bug-audit-log-render-flicker
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

# Audit log view flickers in a tight render loop

## Brief

The audit log view flickers visibly, as if it's re-rendering in a tight loop — likely a React effect/state cycle where a subscription update triggers a state change that re-subscribes, or a `useEffect` whose deps include a freshly-constructed object/array each render. Worth investigating the audit-log component's subscription/data-loading path (`useResource`? `subscriber-fanout-stream`? polling?) and stabilizing identities (`useMemo`, `useCallback`, or moving the stream subscription outside the render path) so the list paints once per real change instead of continuously.

## Suspected area

The audit log surface in `packages/ui/src/` — check for unstable dep arrays in `useEffect`/`useResource`, fresh-object dependencies, or a subscriber that triggers state changes on every event.

## Acceptance criteria

- The audit log view paints once per real audit-event change (no continuous re-render).
- Subscription identity is stable across renders.
- A regression test or render-count assertion pins the stable-paint behavior.

## Implementation notes

**Land mode: already fixed in commit `df9f1f2` (2026-05-14).**

### Root cause

`useConfiguratorActions` listed the entire `opts` object in its `useCallback` deps for `refresh`. The consumer in `memory-inspector-tabs.tsx:65` passes a fresh `{ limit: 100 }` literal every render — a new object identity each time. This caused:

1. `opts` object identity changes every render
2. `refresh` callback identity changes every render
3. `useEffect(() => refresh(), [refresh])` re-fires every render
4. `setLoading(true)` + `setActions(...)` flip React state
5. Another render — back to step 1 (tight loop)

### Fix (already shipped)

In `packages/ui/src/hooks/use-configurator-actions.ts`: destructure `opts?.fromTs` and `opts?.limit` into local primitive variables, then list those primitives — not the `opts` reference — in the `useCallback` dep array. Primitives are compared by value, so a re-render passing a structurally identical `{ limit: 100 }` literal no longer triggers a re-fetch.

### Regression test

`packages/ui/src/hooks/__tests__/use-configurator-actions.test.tsx` — 4 tests:
- "single fetch on mount; identical opts literal across renders does NOT re-fetch (loop-flickers-audit fix)" — asserts `listConfiguratorActions` called exactly once after 3 additional rerenders
- "re-fetches when limit changes" — confirms changing primitive `limit` does trigger a new fetch
- "no-arg call invokes the IPC with an empty payload"
- "error path: spy rejects → error set, loading false, actions unchanged"

All 4 pass (`pnpm vitest run packages/ui/src/hooks/__tests__/use-configurator-actions.test.tsx`).

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode + regression-test addition. Underlying fix (primitive destructuring of `opts.fromTs` / `opts.limit` in `useConfiguratorActions`) shipped in `df9f1f2`. Today's commit `dd7884b` adds 4 regression tests including the explicit anti-loop assertion ("3 rerenders produce zero additional fetches"). The property is now pinned against future regressions.
