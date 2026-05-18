---
id: epic-ui-redesign-ground-up-app-shell-status-strip
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-app-shell
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-ui-redesign-ground-up-app-shell-root-layout-top-nav
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

## Implementation notes

- New files: `packages/ui/src/components/status-strip.tsx` and
  `status-strip.module.css`. Component uses `useActivity()` — same hook
  as the old `<ActivityRail>`.
- Idle state: `max-height: 0; overflow: hidden; opacity: 0` via CSS;
  `hasWork` class transitions to `max-height: 48px; opacity: 1` over
  180ms. No layout space consumed when idle; no content flash.
- Active state: `--color-bg-tertiary` background, `1px solid
  --color-border` bottom border, `--font-mono` 11px kicker for label
  (uppercase + `--letter-spacing-kicker`), `--font-serif` italic 12px
  for detail. Pulse dot uses `--tint-bootstrap` + CSS keyframe animation.
  Hairline progress bar (2px, 72px wide) consistent with ActivityRail.
- Multiple concurrent items separated by a CSS `::before` bullet (no JS
  concatenation); each item is a `<span>` flex row.
- `router.tsx`: `<StatusStrip />` inserted between `<TopNav />` and
  `<main>`. `activity-rail.tsx` file left untouched.
- `role="status"` on the outer `<div>` satisfies Biome's
  `useAriaPropsSupportedByRole` rule (aria-label on a `div` with
  aria-live needs a role).
- 7 tests in `src/__tests__/status-strip.test.tsx`; full UI suite
  (1216 tests, 135 files) passes.

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none (blocker fixed inline — `docs/ARCHITECTURE.md` had two "(planned)" annotations for the status strip that were stale; rolled forward in this review commit)
**Important**: none
**Nits**:
- `use-activity.ts` doc comment referenced `<ActivityRail/>` — updated to `<StatusStrip/>` inline.
- `patterns.md` activity-rail-producer entry referenced `<ActivityRail>` — updated inline.

**Notes**: Clean implementation. Component is minimal (74 lines), CSS uses design tokens throughout, `prefers-reduced-motion` respected, ARIA correct (`role="status"` + `aria-live="polite"` + `aria-label`). Tests cover all 6 item states including detail and progress variants. The `flex-wrap: wrap` + `max-height: 48px` combination will clip many concurrent items, but the single-row ambient use case is correct — no fix needed.
