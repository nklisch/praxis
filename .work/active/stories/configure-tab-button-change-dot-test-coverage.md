---
id: configure-tab-button-change-dot-test-coverage
kind: story
stage: implementing
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
