---
id: epic-ui-redesign-ground-up-app-shell-status-strip
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-app-shell
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-ui-redesign-ground-up-app-shell-root-layout-top-nav
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Status strip — replace blocking ActivityRail with near-invisible ambient surface

## Scope

Replace the existing `<ActivityRail>` blocking-modal mount with an
inline near-invisible status strip beneath the running head. Folds
existing activity events into the strip. Idle = invisible.

## Implementation steps

1. New `packages/ui/src/components/status-strip.{tsx,module.css}`:
   - Subscribes to the existing `ActivityRegistry` events (use
     `useActivity()` hook).
   - Renders one-line summaries for active items (label + spinner
     glyph for in-progress, ✓ for recently finished).
   - Idle state: opacity 0, height 0 — does not consume space.

2. Edit `packages/ui/src/router.tsx`:
   - Remove the existing `<ActivityRail />` mount.
   - Mount `<StatusStrip />` directly beneath the top nav.

3. Tests covering:
   - Strip renders activity events.
   - Idle state is invisible.
   - Multiple concurrent events stack legibly.

4. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] `<ActivityRail>` no longer mounted at the root.
- [ ] `<StatusStrip>` surfaces ambient progress beneath the nav.
- [ ] Idle state is visually invisible (no chrome).
- [ ] All quality checks green.

## Out of scope

- Removing the `ActivityRegistry` service — keep it; the strip
  consumes the same events.
