---
id: epic-ui-redesign-ground-up-app-shell-root-layout-top-nav-doc-drift
kind: story
stage: done
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

## Implementation notes

### Files changed

- **`docs/ARCHITECTURE.md`** — three sites updated:
  1. Diagram label (line 13): replaced `<ActivityRail> at router root` with
     `<TopNav> + <StatusStrip> at router root` + note that rail is not mounted.
  2. `praxis-ingest` table row: replaced "ActivityRail surfaces ingestion
     progress" with status-strip phrasing.
  3. Ingestion section prose (line 384): same replacement.

- **`docs/UX.md`** — three sites updated:
  1. Opening paragraph (line 5): replaced the "`<ActivityRail>` is mounted at
     the router root" sentence with the `<TopNav>` + `<StatusStrip>` description;
     noted that `<ActivityRail>` exists but is not mounted.
  2. Onboarding flow step 3 (line 75, material upload): "progress surfaces on
     the `<ActivityRail>`" → "progress surfaces on the status strip".
  3. Onboarding flow step 3 (line 92, bootstrap): same replacement.

- **`CLAUDE.md`** — UI shell bullet (line 111): rewrote to describe `<TopNav>`
  + `<StatusStrip>` as the new ambient surface; noted that `<ActivityRail>`
  exists but is not mounted; softened to "Long-running services inject
  `ActivityRegistry` via `ServiceDeps.activity`; consumers render via the
  status strip pattern (or, until that lands, the `useActivity()` hook directly)."

- **`docs/ROADMAP.md`** — shipped non-phase chunks entry for Activity rail:
  updated to say the component shipped but is no longer mounted; the app-shell
  top-nav rebuild replaces it with `<StatusStrip>` beneath `<TopNav>`.

### Wording rationale

Every reference now reads: rail component exists (not deleted), not mounted
(fact), status strip is planned (accurate — sibling story `-status-strip`
has not landed). Rolling-Foundation principle: docs describe the system NOW;
future work is called "planned" not "done".

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: `.claude/rules/patterns.md` line 27 (`activity-rail-producer`) still says "items appear on the `<ActivityRail>`" — minor stale phrase. Out of this story's declared scope; can be swept in a later patterns-index pass.

**Notes**: All four acceptance-criteria doc sites updated correctly. No stale "ActivityRail mounted at router root" assertion remains in any foundation doc. Wording accurately reflects the current state: component exists, not mounted, status strip is the planned replacement. Doc-only change; typecheck/lint/test trivially green.
