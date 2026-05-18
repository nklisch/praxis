---
id: epic-ui-redesign-ground-up-app-shell-root-layout-top-nav-doc-drift
kind: story
stage: implementing
tags: [docs]
parent: epic-ui-redesign-ground-up-app-shell
depends_on: [epic-ui-redesign-ground-up-app-shell-root-layout-top-nav]
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Roll foundation docs forward: ActivityRail unmounted from RootLayout

## Scope

Story `epic-ui-redesign-ground-up-app-shell-root-layout-top-nav` removed
`<ActivityRail>` from `RootLayout` in `router.tsx` but did not update the
foundation docs that still assert it is "mounted at the router root". Roll
all affected docs forward to reflect the new top-nav shell shape.

## Files to update

1. **`docs/ARCHITECTURE.md` line 13** — diagram label currently reads
   `<ActivityRail> at router root`. Update to reflect the top-nav chrome
   and status strip (Story 2 will mount `<StatusStrip>` beneath the nav).
   Suggested replacement for the diagram label:
   ```
   │     <TopNav> + <StatusStrip> at router root        │
   │     (ambient background work via status strip)      │
   ```

2. **`docs/UX.md` line 5** — opening paragraph reads:
   > A third ambient surface — `<ActivityRail>` — is mounted at the router
   > root and shows progress for background work (ingestion, indexing,
   > grading) without blocking navigation.

   Update to reflect the new shell: the running head + inline status strip
   beneath it replaces the old rail. Example:
   > The chrome is a top horizontal running head (`<TopNav>`) with a
   > near-invisible status strip directly beneath it (`<StatusStrip>`) that
   > surfaces ambient background work (ingestion, indexing, grading) without
   > blocking navigation.

3. **`CLAUDE.md` line 111** — states "`<ActivityRail />` is mounted at the
   root (in `router.tsx`) and surfaces ambient long-running work via
   `useActivity()`". Update to describe `<TopNav>` + `<StatusStrip>` as
   the new ambient surface anchoring pattern.

4. **`docs/UX.md` line 75 and line 92** — "progress surfaces on the
   `<ActivityRail>`" in the material-upload and bootstrap-explorer
   descriptions. Update to "progress surfaces on the status strip".

## Acceptance criteria

- [ ] All four doc sites updated to reflect the new shell (no stale
      `<ActivityRail> at router root` claims).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green (docs-only change;
      all should be green trivially).
