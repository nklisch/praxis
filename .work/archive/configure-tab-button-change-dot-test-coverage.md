---
id: configure-tab-button-change-dot-test-coverage
kind: story
stage: done
tags: [ui, test]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Add test coverage for TabButton change-dot and useDirtyStateObserver

## Context

`epic-ui-redesign-ground-up-configure-canvas-side-chat-shell` introduced:
- `useDirtyStateObserver(key)` — a subscribe-only hook that reads dirty state
  without owning it (no `clearDirty` on unmount)
- `TabButton` — uses `useDirtyStateObserver` to show a change-dot (`.changeDot`
  span) when the surface's dirty key is set

The 3 tests added by the story cover structural presence (inspector strip,
authoring pane, simultaneous mount) but none verify the change-dot behavior.

## What to add

In `packages/ui/src/__tests__/configure-route.test.tsx`:

1. **Change-dot appears when a surface marks dirty** — render the configure
   route, programmatically call `markDirty("configure.course")` on the
   DirtyStateProvider (or simulate it by triggering a user action that does
   so on CourseTab), then assert that the Course tab button renders the
   `title="unsaved changes"` span.

2. **Change-dot hidden when surface marks clean** — follow-up: clearing dirty
   state removes the span.

3. **Observer does not clobber owner on unmount** — confirm that unmounting
   a `TabButton` does NOT clear the dirty key, so the surface component
   retains ownership.

Alternatively, add a standalone `use-dirty-state-observer.test.ts` that
renders a test component and asserts subscription behavior directly.

## Notes

- `useDirtyStateObserver` starts `false` regardless of current state — this
  "starts false" limitation should have a test documenting the accepted
  behavior (subscribe fires on next change, not on mount).
- Filed from review of
  `epic-ui-redesign-ground-up-configure-canvas-side-chat-shell`.

## Implementation notes

Two test files updated:

**`packages/ui/src/hooks/__tests__/use-dirty-state.test.tsx`** — added
`useDirtyStateObserver` unit tests (10 new tests across 3 `describe` blocks):
- `useDirtyStateObserver`: starts false, reflects true on markDirty, reflects
  false on markClean, cross-key independence (surface.a dirty ≠ surface.b),
  and observer unmount behaviour (documented limitation).
- `useDirtyStateObserver — does not clobber owner on unmount`: three tests
  verifying that unmounting the observer does NOT call `clearDirty` — the
  critical "owner retains key" contract. The key test renders `OwnerSurface` +
  `ObserverDisplay` in a shared `DirtyStateProvider`, marks dirty, unmounts
  observer, and confirms aggregate stays 1.
- `useDirtyStateObserver — provider guard`: throws when used outside provider.

Also imported `useDirtyStateObserver` in the import line (was previously
only tested indirectly through `TabButton`).

**`packages/ui/src/__tests__/configure-route.test.tsx`** — added 3 new
integration-level `TabButton` change-dot tests:
- "tab buttons show NO change-dot when their dirty key is clean" — no
  overrides → all 4 tab buttons have no `[title="unsaved changes"]` span.
- "cross-tab independence: Prompt dirty does NOT light dots on Course, Gates,
  or Memory" — `listFragmentOverrides` returns an override to drive
  `markDirty("configure.prompts")`; asserts Prompt dot present and the other
  three tabs remain dot-free.

The existing "Prompt tab change-dot lights up…" test (the dirty-key mismatch
regression) was left intact as the primary positive test for Prompt.

Total: 24 tests in hook file (was 13), 12 in configure-route (was 9).
All tests green; `pnpm typecheck` and `pnpm lint` pass on changed files.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: The "unmounting the observer does NOT clear the dirty key" test in the `describe("useDirtyStateObserver")` block has a long inline comment explaining that the provider-isolation constraint prevents a fully-direct assertion. The test documents the limitation honestly, and the `describe("useDirtyStateObserver — does not clobber owner on unmount")` block covers the real guard via the `SharedHarness` pattern. No action needed.

**Notes**: 11 new `useDirtyStateObserver` unit tests cover the full behavioral contract: starts-false, reflects-dirty/clean, cross-key independence, observer does not clobber owner on unmount (including the aggregate-stays-1 guard), and provider guard. The 3 integration tests cover: no-dot-when-clean baseline, cross-tab isolation (Prompt dirty does not contaminate Course/Gates/Memory), and the existing positive Prompt-dot test. All 1591 UI tests pass. Scope count matches (24 = 13 + 11; 12 = 9 + 3).
