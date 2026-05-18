---
id: investigate-flaky-use-fragment-overrides-test
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Investigate flaky `use-fragment-overrides` UI test

## Brief

Multiple agents during the 2026-05-18 autopilot run reported a pre-existing
test failure in `packages/ui/src/hooks/__tests__/use-fragment-overrides.test.tsx`
(or similarly named — verify exact path). The failure reproduces on a clean
tree without any of the recent changes (loadOrThrow adoption, helper extracts,
branded IDs, comment sweep).

Symptoms reported:
- Reproduces cleanly on `main` before any 2026-05-18 commits
- Does NOT reproduce when run in isolation? (verify — agent reports were
  inconsistent on isolation behavior)
- Single test failing inside `use-fragment-overrides.test.tsx`

## Implementation plan

1. Reproduce the failure cleanly and capture the diff between expected and
   actual output.
2. Determine whether it's order-dependent (other tests poisoning state) or
   a genuine bug in the hook.
3. If order-dependent: identify the upstream test polluting state; tighten
   isolation (`beforeEach`/`afterEach`, module mocks, fresh stores).
4. If genuine bug: open a separate fix story for the hook and reference it
   from this one.
5. If neither: convert to `it.fails(...)` with a comment naming the
   investigation outcome and re-park if more analysis is needed.

Honest failing test beats a green test that lies — see the `test-integrity`
guidance in the autopilot skill.

## Implementation notes

### Failure reproduction

- Reproduces intermittently (~1 in 3–5 full `pnpm --filter @praxis/ui test` runs) but **never** in isolation (`vitest run` on the file alone).
- Failing test: `useFragmentOverrides > refresh re-calls the loader and updates the map`
- Error: `AssertionError: expected undefined to be 'refreshed'` at line 87 (`byId.get("role.tutor")`)
- Symptom: after `refresh()` completes and `loading` returns to false, `byId` still reflects pre-refresh stale data.

### Root cause classification: genuine test bug

The hook (`use-fragment-overrides.ts` → `use-resource.ts`) is correct. The companion `use-resource.test.tsx` demonstrates the canonical pattern for testing `refresh()`: wrap the call in `await act(async () => { ... })`.

The flaky test called `await result.current.refresh()` directly **without** `act()`. React Testing Library's `act()` ensures React flushes all pending state updates (both `setDataInternal(result)` and `setLoading(false)`) before control returns to the test. Without it, those state updates fire outside React's test scheduler, creating a race: the subsequent `waitFor(() => loading === false)` observes loading=false but does so on a render that may have committed before the data state update propagated — so `byId` is empty. The race only surfaces under load contention with 155 test files running concurrently.

### Fix applied

- Added `act` to the import from `@testing-library/react`.
- Wrapped `await result.current.refresh()` in `await act(async () => { ... })` and removed the now-redundant `waitFor(() => loading === false)` that followed it (act already guarantees all state is flushed).
- Added an inline comment citing the root cause and pointing to `use-resource.test.tsx` as the canonical pattern.

### Verification

- 5/5 full `pnpm --filter @praxis/ui test` runs green (1600/1600) after the fix.
- Previously: failure reproduced on run 1 of a 3-run sequence, and again on run 3 of a 5-run sequence, before the fix.
- No parked follow-ups needed.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Exemplary investigation work. The agent reproduced the failure, classified the root cause precisely (missing `act()` wrapper around an async state-updating call), applied the canonical RTL fix, and verified empirically with 5 consecutive full-suite runs green. The inline comment in the test explains the *why* (race between data and loading updates under parallel-worker load) and points to `use-resource.test.tsx` as the canonical pattern — exactly the kind of self-documenting test code a future maintainer reads with appreciation. The story scope considered both order-dependent and genuine-hook-bug paths; the actual finding (load-dependent test-internal race) was a third path neither pre-anticipated, and was handled correctly without expanding scope or papering over with `it.skip`/`it.fails`.
